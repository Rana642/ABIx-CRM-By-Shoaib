declare
  v_actor  text := nullif(btrim(p->>'actor'), '');
  v_action text := p->>'action';
  v_user   text := nullif(btrim(lower(p->>'username')), '');
  v_company uuid := nullif(p->>'company_id', '')::uuid;
  a        abix.console_users%rowtype;
  u        abix.console_users%rowtype;
  v_id     uuid;
  v_hours  int := coalesce(nullif(p->>'invitation_hours', '')::int, 72);
  v_detail jsonb := p - 'actor' - 'invitation_token_hash';
begin
  select * into a from abix.console_users where username = v_actor;
  if not found or not abix.fn_access_can(v_actor, 'users.manage', null) then
    perform abix.fn_access_log(v_actor, 'users.' || coalesce(v_action, '?'), v_user, null, 'users.manage', 'denied', v_detail);
    raise exception 'FORBIDDEN: only the Owner, or someone the Owner has delegated, manages people';
  end if;
  if v_action not in ('invite', 'reinvite', 'restore', 'assign', 'unassign', 'grant', 'ungrant', 'suspend',
                      'reactivate', 'revoke', 'reset_mfa', 'set_delegate', 'set_mfa_required', 'set_expiry',
                      'set_email') then
    raise exception 'BAD_ACTION: %', v_action;
  end if;

  -- Rules only the Owner may break.
  if not a.is_owner and (
       (v_action = 'assign' and v_company is null)            -- portfolio-wide access
    or v_action in ('grant', 'set_delegate')                  -- sensitive data, exports, delegation
    or (v_user is not null and exists (select 1 from abix.console_users where username = v_user and is_owner))) then
    perform abix.fn_access_log(v_actor, 'users.' || v_action, v_user, v_company, null, 'denied', v_detail);
    raise exception 'FORBIDDEN: only the Owner can do this';
  end if;

  if v_action = 'invite' then
    if v_user is null or v_user !~ '^[a-z0-9._@+-]{2,80}$' then
      raise exception 'BAD_USERNAME: use 2 to 80 letters, digits, dots, dashes, @ or +';
    end if;
    if exists (select 1 from abix.console_users where username = v_user) then
      raise exception 'EXISTS: % already has an account. Use "Send a new invitation" on that account, or "Restore" if it was revoked', v_user;
    end if;
    insert into abix.console_users (username, display_name, email, status, invited_by, mfa_required,
                                    must_change_password, access_expires_at, can_approve)
    values (v_user, coalesce(nullif(btrim(p->>'display_name'), ''), v_user), nullif(btrim(p->>'email'), ''),
            'invited', v_actor, coalesce((p->>'mfa_required')::boolean, true), false,
            nullif(p->>'access_expires_at', '')::timestamptz, false);
  end if;

  -- A revoked account comes back only through 'restore', and only as an invitation.
  if v_action = 'restore' then
    select * into u from abix.console_users where username = v_user;
    if not found then raise exception 'NOT_FOUND: no account %', v_user; end if;
    if u.status <> 'revoked' then raise exception 'NOT_REVOKED: only a revoked account is restored; this one is %', u.status; end if;
    update abix.console_users
       set status = 'invited', mfa_enabled = false, mfa_secret = null,
           email = coalesce(nullif(btrim(p->>'email'), ''), email),
           access_expires_at = nullif(p->>'access_expires_at', '')::timestamptz
     where username = v_user;
  end if;

  if v_action = 'set_email' then
    update abix.console_users set email = nullif(btrim(p->>'email'), '') where username = v_user;
    if not found then raise exception 'NOT_FOUND: no account %', v_user; end if;
  end if;

  if v_action in ('invite', 'reinvite', 'restore') then
    select * into u from abix.console_users where username = v_user;
    if not found then raise exception 'NOT_FOUND: no account %', v_user; end if;
    if u.status = 'revoked' then raise exception 'REVOKED: % was revoked; use Restore to bring it back', v_user; end if;
    if nullif(p->>'invitation_token_hash', '') is null then raise exception 'TOKEN_REQUIRED'; end if;
    update abix.console_invitations set revoked_at = now()
     where username = v_user and accepted_at is null and revoked_at is null;
    insert into abix.console_invitations (token_hash, username, invited_by, expires_at)
    values (p->>'invitation_token_hash', v_user, v_actor, now() + make_interval(hours => v_hours))
    returning invitation_id into v_id;
    -- A new invitation replaces the current password and ends open sessions: the person starts again.
    if v_action in ('reinvite', 'restore') then
      update abix.console_users set status = 'invited' where username = v_user;
      delete from abix.console_logins where username = v_user;
      perform abix.fn_access_end_sessions(v_user);
    end if;
  end if;

  if v_action = 'assign' then
    if v_company is not null and not exists (select 1 from abix.companies where company_id = v_company) then
      raise exception 'NO_COMPANY: that business does not exist';
    end if;
    if p->>'role' not in ('viewer', 'operator', 'workspace_admin') then
      raise exception 'BAD_ROLE: use viewer, operator or workspace_admin';
    end if;
    update abix.access_assignments set revoked_at = now(), revoked_by = v_actor
     where username = v_user and revoked_at is null and company_id is not distinct from v_company;
    insert into abix.access_assignments (username, company_id, role_code, granted_by, expires_at, note)
    values (v_user, v_company, p->>'role', v_actor, nullif(p->>'expires_at', '')::timestamptz, nullif(p->>'note', ''))
    returning assignment_id into v_id;
    perform abix.fn_access_end_sessions(v_user);
  end if;

  if v_action = 'unassign' then
    update abix.access_assignments set revoked_at = now(), revoked_by = v_actor
     where assignment_id = (p->>'assignment_id')::uuid and revoked_at is null
    returning username into v_user;
    if v_user is null then raise exception 'NOT_FOUND: that access is no longer active'; end if;
  end if;

  if v_action = 'grant' then
    if p->>'permission' not in ('sensitive.view', 'data.export') then
      raise exception 'BAD_PERMISSION: use sensitive.view or data.export';
    end if;
    insert into abix.access_user_grants (username, permission_code, company_id, granted_by, expires_at)
    values (v_user, p->>'permission', v_company, v_actor, nullif(p->>'expires_at', '')::timestamptz)
    returning grant_id into v_id;
  end if;

  if v_action = 'ungrant' then
    update abix.access_user_grants set revoked_at = now(), revoked_by = v_actor
     where grant_id = (p->>'grant_id')::uuid and revoked_at is null
    returning username into v_user;
    if v_user is null then raise exception 'NOT_FOUND: that permission is no longer active'; end if;
  end if;

  if v_action in ('suspend', 'revoke') then
    if v_user = v_actor then raise exception 'SELF: you cannot suspend or revoke your own account'; end if;
    update abix.console_users set status = case v_action when 'suspend' then 'suspended' else 'revoked' end
     where username = v_user;
    if not found then raise exception 'NOT_FOUND: no account %', v_user; end if;
    update abix.console_invitations set revoked_at = now()
     where username = v_user and accepted_at is null and revoked_at is null;
    if v_action = 'revoke' then
      update abix.access_assignments set revoked_at = now(), revoked_by = v_actor where username = v_user and revoked_at is null;
      update abix.access_user_grants set revoked_at = now(), revoked_by = v_actor where username = v_user and revoked_at is null;
      delete from abix.console_logins where username = v_user;
    end if;
    v_detail := v_detail || jsonb_build_object('sessions_and_tokens_ended', abix.fn_access_end_sessions(v_user));
  end if;

  if v_action = 'reactivate' then
    update abix.console_users set status = 'active' where username = v_user and status = 'suspended';
    if not found then raise exception 'NOT_SUSPENDED: only a suspended account can be reactivated'; end if;
    -- Reactivating alone leaves the person without a way in if they never set a password.
    if not exists (select 1 from abix.console_logins where username = v_user) then
      v_detail := v_detail || jsonb_build_object('needs_invitation', true);
    end if;
  end if;

  if v_action = 'reset_mfa' then
    update abix.console_users set mfa_enabled = false, mfa_secret = null where username = v_user;
    perform abix.fn_access_end_sessions(v_user);
  end if;

  if v_action = 'set_delegate' then
    update abix.console_users set can_manage_users = (p->>'value')::boolean where username = v_user;
  end if;
  if v_action = 'set_mfa_required' then
    update abix.console_users set mfa_required = (p->>'value')::boolean where username = v_user;
  end if;
  if v_action = 'set_expiry' then
    update abix.console_users set access_expires_at = nullif(p->>'access_expires_at', '')::timestamptz where username = v_user;
  end if;

  -- Reduced access takes effect on the next request anyway (every check reads these tables); signed-in
  -- sessions and connector tokens are also ended so nothing keeps working on stale rights.
  if v_action in ('unassign', 'ungrant', 'set_delegate', 'set_expiry') then
    perform abix.fn_access_end_sessions(v_user);
  end if;

  insert into abix.access_audit (actor, action, target, company_id, outcome, detail)
  values (v_actor, 'users.' || v_action, v_user, v_company, 'done', v_detail);
  return jsonb_build_object('ok', true, 'username', v_user, 'id', v_id,
                            'email', (select email from abix.console_users where username = v_user),
                            'needs_invitation', coalesce((v_detail->>'needs_invitation')::boolean, false));
end;
