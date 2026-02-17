import template from './admin.html?raw';
import './admin.css';
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

async function requireAdmin(messageElement) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return null;
  }

  const { data: roleRecord, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (roleError) {
    showMessage(messageElement, roleError.message || 'Failed to load role.', 'danger');
    return null;
  }

  if (roleRecord?.role !== 'admin') {
    showMessage(messageElement, 'Admin role required.', 'warning');
    setTimeout(() => {
      window.location.href = '/dashboard/';
    }, 1200);
    return null;
  }

  return session;
}

export async function renderAdminPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#adminMessage');
  const projectsTableBody = page.querySelector('#adminProjectsTableBody');
  const stagesProjectSelect = page.querySelector('#adminStagesProjectSelect');
  const stagesTableBody = page.querySelector('#adminStagesTableBody');
  const tasksProjectSelect = page.querySelector('#adminTasksProjectSelect');
  const tasksTableBody = page.querySelector('#adminTasksTableBody');
  const usersTableBody = page.querySelector('#adminUsersTableBody');

  const session = await requireAdmin(messageElement);

  if (!session) {
    return page;
  }

  const state = {
    projects: [],
    stagesByProjectId: new Map(),
    users: []
  };

  const renderProjectSelects = () => {
    if (!state.projects.length) {
      stagesProjectSelect.innerHTML = '<option value="">No projects</option>';
      tasksProjectSelect.innerHTML = '<option value="">No projects</option>';
      return;
    }

    const projectOptionsHtml = state.projects
      .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
      .join('');

    stagesProjectSelect.innerHTML = projectOptionsHtml;
    tasksProjectSelect.innerHTML = projectOptionsHtml;
  };

  const renderProjects = () => {
    if (!state.projects.length) {
      projectsTableBody.innerHTML = '<tr><td colspan="4" class="text-body-secondary">No projects found.</td></tr>';
      return;
    }

    projectsTableBody.innerHTML = state.projects
      .map((project) => `
        <tr>
          <td class="admin-col-title">${escapeHtml(project.name)}</td>
          <td>${escapeHtml(project.owner_email || project.owner_id)}</td>
          <td>${formatDate(project.created_at)}</td>
          <td class="text-end">
            <div class="admin-actions">
              <a class="btn btn-sm btn-outline-secondary" href="/project/${project.id}/tasks">View</a>
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-project" data-project-id="${project.id}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-project" data-project-id="${project.id}" data-project-name="${escapeHtml(project.name)}">Delete</button>
            </div>
          </td>
        </tr>
      `)
      .join('');
  };

  const renderStages = (projectId) => {
    const stages = state.stagesByProjectId.get(projectId) || [];

    if (!stages.length) {
      stagesTableBody.innerHTML = '<tr><td colspan="3" class="text-body-secondary">No stages for this project.</td></tr>';
      return;
    }

    stagesTableBody.innerHTML = stages
      .map((stage) => `
        <tr>
          <td>${escapeHtml(stage.name)}</td>
          <td>${stage.order_position}</td>
          <td class="text-end">
            <div class="admin-actions">
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-stage" data-stage-id="${stage.id}" data-project-id="${projectId}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-stage" data-stage-id="${stage.id}" data-project-id="${projectId}" data-stage-name="${escapeHtml(stage.name)}">Delete</button>
            </div>
          </td>
        </tr>
      `)
      .join('');
  };

  const renderTasks = (tasks, stageNameById, projectId) => {
    if (!tasks.length) {
      tasksTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No tasks for this project.</td></tr>';
      return;
    }

    tasksTableBody.innerHTML = tasks
      .map((task) => `
        <tr>
          <td class="admin-col-title">${escapeHtml(task.title)}</td>
          <td>${escapeHtml(stageNameById.get(task.stage_id) || 'Unknown')}</td>
          <td>${task.done ? 'Yes' : 'No'}</td>
          <td>${task.order_position}</td>
          <td class="text-end">
            <div class="admin-actions">
              <a class="btn btn-sm btn-outline-secondary" href="/project/${projectId}/tasks">View</a>
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-task" data-task-id="${task.id}" data-project-id="${projectId}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-task" data-task-id="${task.id}" data-task-title="${escapeHtml(task.title)}">Delete</button>
            </div>
          </td>
        </tr>
      `)
      .join('');
  };

  const renderUsers = () => {
    if (!state.users.length) {
      usersTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No users found.</td></tr>';
      return;
    }

    usersTableBody.innerHTML = state.users
      .map((user) => `
        <tr>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${escapeHtml(user.role || 'user')}</td>
          <td>${formatDate(user.created_at)}</td>
          <td>${formatDate(user.last_sign_in_at)}</td>
          <td class="text-end">
            <div class="admin-actions">
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-user" data-user-id="${user.id}">Edit</button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="delete-user"
                data-user-id="${user.id}"
                data-user-email="${escapeHtml(user.email || '-')}" 
                ${user.id === session.user.id ? 'disabled' : ''}
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      `)
      .join('');
  };

  const loadProjects = async () => {
    showMessage(messageElement, 'Loading projects...', 'secondary');

    const [projectsResult, profilesResult] = await Promise.all([
      supabase.from('projects').select('id, name, owner_id, created_at').order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, email')
    ]);

    if (projectsResult.error || profilesResult.error) {
      showMessage(messageElement, projectsResult.error?.message || profilesResult.error?.message || 'Failed to load projects.', 'danger');
      return false;
    }

    const profileById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile.email]));

    state.projects = (projectsResult.data || []).map((project) => ({
      ...project,
      owner_email: profileById.get(project.owner_id) || ''
    }));

    renderProjects();
    renderProjectSelects();
    showMessage(messageElement, '');
    return true;
  };

  const loadStages = async (projectId) => {
    if (!projectId) {
      stagesTableBody.innerHTML = '<tr><td colspan="3" class="text-body-secondary">Select a project to load stages.</td></tr>';
      return [];
    }

    const { data, error } = await supabase
      .from('project_stages')
      .select('id, name, order_position')
      .eq('project_id', projectId)
      .order('order_position', { ascending: true });

    if (error) {
      showMessage(messageElement, error.message || 'Failed to load stages.', 'danger');
      return [];
    }

    state.stagesByProjectId.set(projectId, data || []);
    renderStages(projectId);
    return data || [];
  };

  const loadTasks = async (projectId) => {
    if (!projectId) {
      tasksTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Select a project to load tasks.</td></tr>';
      return;
    }

    const [tasksResult, stagesResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, stage_id, done, order_position')
        .eq('project_id', projectId)
        .order('order_position', { ascending: true }),
      supabase
        .from('project_stages')
        .select('id, name')
        .eq('project_id', projectId)
    ]);

    if (tasksResult.error || stagesResult.error) {
      showMessage(messageElement, tasksResult.error?.message || stagesResult.error?.message || 'Failed to load tasks.', 'danger');
      return;
    }

    const stageNameById = new Map((stagesResult.data || []).map((stage) => [stage.id, stage.name]));
    renderTasks(tasksResult.data || [], stageNameById, projectId);
  };

  const loadUsers = async () => {
    showMessage(messageElement, 'Loading users...', 'secondary');

    const { data, error } = await supabase.rpc('admin_list_users');

    if (error) {
      showMessage(messageElement, error.message || 'Failed to load users.', 'danger');
      return;
    }

    state.users = data || [];
    renderUsers();
    showMessage(messageElement, '');
  };

  projectsTableBody.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-action="edit-project"]');
    const deleteButton = event.target.closest('[data-action="delete-project"]');

    if (editButton) {
      const projectId = editButton.getAttribute('data-project-id');
      const project = state.projects.find((item) => item.id === projectId);

      if (!project) {
        return;
      }

      const newName = window.prompt('Edit project name', project.name)?.trim();
      if (!newName || newName === project.name) {
        return;
      }

      showMessage(messageElement, 'Updating project...', 'secondary');
      const { error } = await supabase.from('projects').update({ name: newName }).eq('id', projectId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to update project.', 'danger');
        return;
      }

      await loadProjects();
      await loadStages(stagesProjectSelect.value || state.projects[0]?.id || '');
      await loadTasks(tasksProjectSelect.value || state.projects[0]?.id || '');
      showMessage(messageElement, 'Project updated.', 'success');
      return;
    }

    if (deleteButton) {
      const projectId = deleteButton.getAttribute('data-project-id');
      const projectName = deleteButton.getAttribute('data-project-name') || 'this project';

      if (!window.confirm(`Delete ${projectName}? This cannot be undone.`)) {
        return;
      }

      showMessage(messageElement, 'Deleting project...', 'secondary');
      const { error } = await supabase.from('projects').delete().eq('id', projectId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to delete project.', 'danger');
        return;
      }

      await loadProjects();
      const nextProjectId = state.projects[0]?.id || '';
      stagesProjectSelect.value = nextProjectId;
      tasksProjectSelect.value = nextProjectId;
      await loadStages(nextProjectId);
      await loadTasks(nextProjectId);
      showMessage(messageElement, 'Project deleted.', 'success');
    }
  });

  stagesProjectSelect.addEventListener('change', async () => {
    await loadStages(stagesProjectSelect.value);
  });

  stagesTableBody.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-action="edit-stage"]');
    const deleteButton = event.target.closest('[data-action="delete-stage"]');

    if (editButton) {
      const stageId = editButton.getAttribute('data-stage-id');
      const projectId = editButton.getAttribute('data-project-id');
      const stages = state.stagesByProjectId.get(projectId) || [];
      const stage = stages.find((item) => item.id === stageId);

      if (!stage) {
        return;
      }

      const newName = window.prompt('Edit stage name', stage.name)?.trim();
      if (!newName) {
        return;
      }

      const orderInput = window.prompt('Edit stage order', String(stage.order_position));
      const newOrder = Number.parseInt(String(orderInput || ''), 10);

      if (!Number.isInteger(newOrder) || newOrder <= 0) {
        showMessage(messageElement, 'Stage order must be a positive integer.', 'warning');
        return;
      }

      showMessage(messageElement, 'Updating stage...', 'secondary');
      const { error } = await supabase.from('project_stages').update({ name: newName, order_position: newOrder }).eq('id', stageId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to update stage.', 'danger');
        return;
      }

      await loadStages(projectId);
      await loadTasks(tasksProjectSelect.value);
      showMessage(messageElement, 'Stage updated.', 'success');
      return;
    }

    if (deleteButton) {
      const stageId = deleteButton.getAttribute('data-stage-id');
      const projectId = deleteButton.getAttribute('data-project-id');
      const stageName = deleteButton.getAttribute('data-stage-name') || 'this stage';

      if (!window.confirm(`Delete ${stageName}?`)) {
        return;
      }

      showMessage(messageElement, 'Deleting stage...', 'secondary');
      const { error } = await supabase.from('project_stages').delete().eq('id', stageId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to delete stage.', 'danger');
        return;
      }

      await loadStages(projectId);
      await loadTasks(tasksProjectSelect.value);
      showMessage(messageElement, 'Stage deleted.', 'success');
    }
  });

  tasksProjectSelect.addEventListener('change', async () => {
    await loadTasks(tasksProjectSelect.value);
  });

  tasksTableBody.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-action="edit-task"]');
    const deleteButton = event.target.closest('[data-action="delete-task"]');

    if (editButton) {
      const taskId = editButton.getAttribute('data-task-id');
      const projectId = editButton.getAttribute('data-project-id');

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, stage_id, done, order_position')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        showMessage(messageElement, taskError?.message || 'Task not found.', 'danger');
        return;
      }

      const { data: stages, error: stageError } = await supabase
        .from('project_stages')
        .select('id, name')
        .eq('project_id', projectId)
        .order('order_position', { ascending: true });

      if (stageError) {
        showMessage(messageElement, stageError.message || 'Failed to load stages.', 'danger');
        return;
      }

      const stageHint = (stages || []).map((stage) => `${stage.id}: ${stage.name}`).join('\n');
      const newTitle = window.prompt('Edit task title', task.title)?.trim();
      if (!newTitle) {
        return;
      }

      const newStageId = window.prompt(`Edit stage id:\n${stageHint}`, task.stage_id)?.trim();
      if (!newStageId) {
        return;
      }

      const isDone = window.confirm('Mark this task as done? Click Cancel for Open.');

      showMessage(messageElement, 'Updating task...', 'secondary');
      const { error } = await supabase.from('tasks').update({ title: newTitle, stage_id: newStageId, done: isDone }).eq('id', taskId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to update task.', 'danger');
        return;
      }

      await loadTasks(projectId);
      showMessage(messageElement, 'Task updated.', 'success');
      return;
    }

    if (deleteButton) {
      const taskId = deleteButton.getAttribute('data-task-id');
      const taskTitle = deleteButton.getAttribute('data-task-title') || 'this task';
      const projectId = tasksProjectSelect.value;

      if (!window.confirm(`Delete ${taskTitle}?`)) {
        return;
      }

      showMessage(messageElement, 'Deleting task...', 'secondary');
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);

      if (error) {
        showMessage(messageElement, error.message || 'Failed to delete task.', 'danger');
        return;
      }

      await loadTasks(projectId);
      showMessage(messageElement, 'Task deleted.', 'success');
    }
  });

  usersTableBody.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-action="edit-user"]');
    const deleteButton = event.target.closest('[data-action="delete-user"]');

    if (editButton) {
      const userId = editButton.getAttribute('data-user-id');
      const user = state.users.find((item) => item.id === userId);
      if (!user) {
        return;
      }

      const nextEmail = window.prompt('Edit user email', user.email || '')?.trim();
      if (!nextEmail) {
        return;
      }

      const roleInput = window.prompt('Set role (admin or user)', user.role || 'user');
      const nextRole = String(roleInput || '').trim().toLowerCase();

      if (!['admin', 'user'].includes(nextRole)) {
        showMessage(messageElement, 'Role must be admin or user.', 'warning');
        return;
      }

      showMessage(messageElement, 'Updating user...', 'secondary');
      const { error } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_email: nextEmail,
        p_role: nextRole
      });

      if (error) {
        showMessage(messageElement, error.message || 'Failed to update user.', 'danger');
        return;
      }

      await loadUsers();
      showMessage(messageElement, 'User updated.', 'success');
      return;
    }

    if (deleteButton) {
      const userId = deleteButton.getAttribute('data-user-id');
      const userEmail = deleteButton.getAttribute('data-user-email') || 'this user';

      if (!window.confirm(`Delete ${userEmail}? This permanently removes the account.`)) {
        return;
      }

      showMessage(messageElement, 'Deleting user...', 'secondary');
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });

      if (error) {
        showMessage(messageElement, error.message || 'Failed to delete user.', 'danger');
        return;
      }

      await loadUsers();
      await loadProjects();
      showMessage(messageElement, 'User deleted.', 'success');
    }
  });

  const loadedProjects = await loadProjects();
  if (loadedProjects) {
    const initialProjectId = state.projects[0]?.id || '';
    stagesProjectSelect.value = initialProjectId;
    tasksProjectSelect.value = initialProjectId;
    await loadStages(initialProjectId);
    await loadTasks(initialProjectId);
  }

  await loadUsers();

  return page;
}
