import template from './project-users.html?raw';
import './project-users.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../lib/supabase-client.js';

function showMessage(messageElement, message, variant = 'secondary') {
  if (!message) {
    messageElement.className = 'alert d-none';
    messageElement.textContent = '';
    return;
  }

  messageElement.className = `alert alert-${variant}`;
  messageElement.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveProjectIdFromLocation() {
  const pathMatch = window.location.pathname.match(/^\/projects\/([^/]+)\/users\/?$/);

  if (!pathMatch?.[1]) {
    return '';
  }

  return decodeURIComponent(pathMatch[1]);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export async function renderProjectUsersPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const projectNameElement = page.querySelector('#projectUsersProjectName');
  const messageElement = page.querySelector('#projectUsersMessage');
  const membersTableBody = page.querySelector('#projectUsersTableBody');
  const allUsersTableBody = page.querySelector('#allUsersTableBody');
  const userSearchInput = page.querySelector('#userSearchInput');
  const openAddUserModalButton = page.querySelector('#openAddUserModal');
  const removeUserNameElement = page.querySelector('#removeUserName');
  const confirmRemoveUserButton = page.querySelector('#confirmRemoveUser');

  const addUserModal = new Modal(page.querySelector('#addUserModal'));
  const removeUserModal = new Modal(page.querySelector('#removeUserModal'));

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  const projectId = resolveProjectIdFromLocation();
  if (!projectId) {
    showMessage(messageElement, 'Missing project id.', 'warning');
    openAddUserModalButton.classList.add('d-none');
    membersTableBody.innerHTML = '';
    return page;
  }

  let project = null;
  let memberships = [];
  let allUsers = [];
  let pendingRemoveMember = null;
  let isOwner = false;

  const renderMembersTable = () => {
    if (!memberships.length) {
      membersTableBody.innerHTML = '<tr><td colspan="3" class="text-body-secondary">No assigned users yet.</td></tr>';
      return;
    }

    membersTableBody.innerHTML = memberships
      .map((member) => {
        const safeEmail = escapeHtml(member.email || 'Unknown');
        const safeMembershipId = escapeHtml(member.id);

        return `
          <tr>
            <td>${safeEmail}</td>
            <td>${formatDate(member.created_at)}</td>
            <td class="text-end">
              <div class="member-actions">
                ${
                  isOwner
                    ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-member" data-member-id="${safeMembershipId}" data-member-email="${safeEmail}">
                  Remove
                </button>`
                    : '<span class="text-body-secondary">-</span>'
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const renderAllUsersTable = () => {
    const assignedUserIds = new Set(memberships.map((member) => member.user_id));
    const searchTerm = userSearchInput.value.trim().toLowerCase();

    const filteredUsers = allUsers.filter((user) => {
      if (!searchTerm) {
        return true;
      }

      return (user.email || '').toLowerCase().includes(searchTerm);
    });

    if (!filteredUsers.length) {
      allUsersTableBody.innerHTML = '<tr><td colspan="2" class="text-body-secondary">No users found.</td></tr>';
      return;
    }

    allUsersTableBody.innerHTML = filteredUsers
      .map((user) => {
        const safeEmail = escapeHtml(user.email || 'Unknown');
        const safeUserId = escapeHtml(user.id);
        const isAssigned = assignedUserIds.has(user.id);

        return `
          <tr>
            <td>${safeEmail}</td>
            <td class="text-end">
              <button
                type="button"
                class="btn btn-sm ${isAssigned ? 'btn-outline-secondary' : 'btn-outline-primary'}"
                data-action="assign-user"
                data-user-id="${safeUserId}"
                ${isAssigned ? 'disabled' : ''}
              >
                ${isAssigned ? 'Assigned' : 'Add'}
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const loadData = async () => {
    showMessage(messageElement, 'Loading project users...', 'secondary');

    const [projectResult, membershipsResult, usersResult] = await Promise.all([
      supabase.from('projects').select('id, name, owner_id').eq('id', projectId).single(),
      supabase.from('project_members').select('id, user_id, created_at').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, email').order('email', { ascending: true })
    ]);

    if (projectResult.error || membershipsResult.error || usersResult.error) {
      showMessage(
        messageElement,
        projectResult.error?.message || membershipsResult.error?.message || usersResult.error?.message || 'Failed to load project users.',
        'danger'
      );
      openAddUserModalButton.classList.add('d-none');
      return;
    }

    project = projectResult.data;
    projectNameElement.textContent = `Project: ${project.name}`;

    isOwner = project.owner_id === session.user.id;
    if (!isOwner) {
      openAddUserModalButton.classList.add('d-none');
      showMessage(messageElement, 'Only the project owner can manage members.', 'warning');
    } else {
      openAddUserModalButton.classList.remove('d-none');
      showMessage(messageElement, '');
    }

    allUsers = (usersResult.data || []).filter((user) => user.id !== project.owner_id);

    const usersById = new Map((usersResult.data || []).map((user) => [user.id, user]));
    memberships = (membershipsResult.data || []).map((member) => ({
      ...member,
      email: usersById.get(member.user_id)?.email || 'Unknown'
    }));

    renderMembersTable();
    renderAllUsersTable();
  };

  userSearchInput.addEventListener('input', () => {
    renderAllUsersTable();
  });

  openAddUserModalButton.addEventListener('click', () => {
    userSearchInput.value = '';
    renderAllUsersTable();
    addUserModal.show();
    userSearchInput.focus();
  });

  allUsersTableBody.addEventListener('click', async (event) => {
    if (!isOwner) {
      return;
    }

    const assignButton = event.target.closest('[data-action="assign-user"]');
    if (!assignButton || assignButton.disabled) {
      return;
    }

    const userId = assignButton.getAttribute('data-user-id');
    if (!userId) {
      return;
    }

    assignButton.disabled = true;
    showMessage(messageElement, 'Assigning user...', 'secondary');

    const { error } = await supabase.from('project_members').insert({
      project_id: projectId,
      user_id: userId
    });

    if (error) {
      showMessage(messageElement, error.message || 'Failed to assign user.', 'danger');
      assignButton.disabled = false;
      return;
    }

    await loadData();
    showMessage(messageElement, 'User assigned.', 'success');
  });

  membersTableBody.addEventListener('click', (event) => {
    if (!isOwner) {
      return;
    }

    const removeButton = event.target.closest('[data-action="remove-member"]');
    if (!removeButton) {
      return;
    }

    pendingRemoveMember = {
      memberId: removeButton.getAttribute('data-member-id'),
      email: removeButton.getAttribute('data-member-email')
    };

    removeUserNameElement.textContent = pendingRemoveMember.email || 'this user';
    removeUserModal.show();
  });

  confirmRemoveUserButton.addEventListener('click', async () => {
    if (!pendingRemoveMember?.memberId) {
      return;
    }

    confirmRemoveUserButton.disabled = true;
    showMessage(messageElement, 'Removing user...', 'secondary');

    const { error } = await supabase.from('project_members').delete().eq('id', pendingRemoveMember.memberId);

    confirmRemoveUserButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message || 'Failed to remove user.', 'danger');
      return;
    }

    removeUserModal.hide();
    pendingRemoveMember = null;
    await loadData();
    showMessage(messageElement, 'User removed.', 'success');
  });

  await loadData();
  return page;
}
