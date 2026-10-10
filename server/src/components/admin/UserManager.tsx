import { FormEvent } from 'react';
import { BlogUser } from '../../lib/blog';

interface AdminUserForm {
  username: string;
  password: string;
  nickname: string;
  permission: BlogUser['permission'];
}

interface UserManagerProps {
  adminPanelOpen: boolean;
  adminUsers: BlogUser[];
  adminUserForm: AdminUserForm;
  onTogglePanel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChangeCreateForm: (patch: Partial<AdminUserForm>) => void;
  onChangeUser: (userId: string, patch: Partial<Pick<BlogUser, 'nickname' | 'permission'>>) => void;
  onSaveUser: (user: BlogUser) => void;
  onRemoveUser: (user: BlogUser) => void;
}

export function UserManager({
  adminPanelOpen,
  adminUsers,
  adminUserForm,
  onTogglePanel,
  onSubmit,
  onChangeCreateForm,
  onChangeUser,
  onSaveUser,
  onRemoveUser
}: UserManagerProps) {
  return (
    <section className={adminPanelOpen ? 'admin-group admin-user-group open' : 'admin-group admin-user-group'}>
      <div className="panel-heading">
        <h2>用户管理</h2>
        <button onClick={onTogglePanel} type="button">
          {adminPanelOpen ? '收起' : '展开'}
        </button>
      </div>
      {adminPanelOpen ? (
        <div className="admin-user-list">
          <form className="admin-user admin-user-create" onSubmit={onSubmit}>
            <input onChange={(event) => onChangeCreateForm({ username: event.target.value })} placeholder="用户名" value={adminUserForm.username} />
            <input
              onChange={(event) => onChangeCreateForm({ password: event.target.value })}
              placeholder="初始密码"
              type="password"
              value={adminUserForm.password}
            />
            <input onChange={(event) => onChangeCreateForm({ nickname: event.target.value })} placeholder="昵称" value={adminUserForm.nickname} />
            <select
              onChange={(event) => onChangeCreateForm({ permission: event.target.value as BlogUser['permission'] })}
              value={adminUserForm.permission}
            >
              <option value="reader">读者用户</option>
              <option value="admin">管理员</option>
            </select>
            <button type="submit">新增用户</button>
          </form>
          {adminUsers.map((user) => (
            <div className="admin-user" key={user.id}>
              <span className="admin-user-name">{user.username}</span>
              <input onChange={(event) => onChangeUser(user.id, { nickname: event.target.value })} placeholder="昵称" value={user.nickname} />
              <select
                onChange={(event) => onChangeUser(user.id, { permission: event.target.value as BlogUser['permission'] })}
                value={user.permission}
              >
                <option value="reader">读者用户</option>
                <option value="admin">管理员</option>
              </select>
              <button onClick={() => onSaveUser(user)} type="button">
                保存
              </button>
              <button className="danger" onClick={() => onRemoveUser(user)} type="button">
                删除
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
