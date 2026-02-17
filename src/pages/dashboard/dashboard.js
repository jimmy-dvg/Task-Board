import template from './dashboard.html?raw';
import './dashboard.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../lib/supabase-client.js';

const PROJECT_STAGE_TEMPLATES = {
  basic: ['Not Started', 'In Progress', 'Done'],
  kanban: ['Backlog', 'Selected', 'In Progress', 'Review', 'Done'],
  'bug-tracking': ['Reported', 'Triaged', 'In Progress', 'QA', 'Done'],
  content: ['Ideas', 'Draft', 'Editing', 'Scheduled', 'Published']
};

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

function truncateText(value, maxLength = 90) {
  const text = String(value || '').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function setFieldError(inputElement, feedbackElement, message) {
  inputElement.classList.add('is-invalid');
  feedbackElement.textContent = message;
}

function clearFieldError(inputElement, feedbackElement) {
  inputElement.classList.remove('is-invalid');
  feedbackElement.textContent = '';
}

function validateProjectName(projectName) {
  const trimmedName = String(projectName || '').trim();

  if (!trimmedName) {
    return { valid: false, message: 'Project title is required.' };
  }

  if (trimmedName.length < 3) {
    return { valid: false, message: 'Project title must be at least 3 characters.' };
  }

  if (trimmedName.length > 120) {
    return { valid: false, message: 'Project title must be 120 characters or less.' };
  }

  return { valid: true, message: '' };
}

async function hasDuplicateProjectName(ownerId, projectName, currentProjectId = null) {
  const { data, error } = await supabase.from('projects').select('id, name').eq('owner_id', ownerId);

  if (error) {
    return { duplicate: false, error };
  }

  const normalizedTargetName = String(projectName || '').trim().toLowerCase();
  const duplicate = (data || []).some((project) => {
    if (currentProjectId && project.id === currentProjectId) {
      return false;
    }

    return String(project.name || '').trim().toLowerCase() === normalizedTargetName;
  });

  return { duplicate, error: null };
}

async function createProjectStages(projectId, stageNames) {
  const stages = (stageNames || []).map((stageName, index) => ({
    project_id: projectId,
    name: stageName,
    order_position: index + 1
  }));

  const { error } = await supabase.from('project_stages').insert(stages);
  return { error };
}

function renderColumns(boardColumnsElement, stages, tasks) {
  boardColumnsElement.innerHTML = '';

  stages.forEach((stage) => {
    const column = document.createElement('section');
    column.className = 'board-column';

    const header = document.createElement('div');
    header.className = 'board-column-header';
    header.textContent = stage.name;

    const taskList = document.createElement('div');
    taskList.className = 'board-task-list';

    const stageTasks = tasks
      .filter((task) => task.stage_id === stage.id)
      .sort((firstTask, secondTask) => firstTask.order_position - secondTask.order_position);

    if (!stageTasks.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'board-empty';
      emptyState.textContent = 'No tasks.';
      taskList.append(emptyState);
    }

    stageTasks.forEach((task) => {
      const card = document.createElement('article');
      card.className = 'board-task';

      const title = document.createElement('h3');
      title.textContent = task.title;

      const description = document.createElement('div');
      description.className = 'board-task-description text-body-secondary';
      description.innerHTML = task.description_html || '';

      const status = document.createElement('small');
      status.className = task.done ? 'text-success' : 'text-body-secondary';
      status.textContent = task.done ? 'Done' : 'Open';

      card.append(title, description, status);
      taskList.append(card);
    });

    column.append(header, taskList);
    boardColumnsElement.append(column);
  });
}

function setSummaryCounts(summaryElements, projectsCount, taskItems) {
  const totalTasks = taskItems.length;
  const doneTasks = taskItems.filter((task) => task.done).length;
  const pendingTasks = totalTasks - doneTasks;

  summaryElements.projectsCount.textContent = String(projectsCount);
  summaryElements.tasksTotalCount.textContent = String(totalTasks);
  summaryElements.tasksPendingCount.textContent = String(pendingTasks);
  summaryElements.tasksDoneCount.textContent = String(doneTasks);
}

function setProjectLink(projectDetailsLink, projectId) {
  if (!projectId) {
    projectDetailsLink.href = '#';
    projectDetailsLink.classList.add('disabled');
    projectDetailsLink.setAttribute('aria-disabled', 'true');
    return;
  }

  projectDetailsLink.href = `/project/${projectId}/tasks`;
  projectDetailsLink.classList.remove('disabled');
  projectDetailsLink.removeAttribute('aria-disabled');
}

async function loadProjectData(projectId, boardColumnsElement, messageElement) {
  if (!projectId) {
    boardColumnsElement.innerHTML = '';
    return;
  }

  showMessage(messageElement, 'Loading board...', 'secondary');

  const [stagesResult, tasksResult] = await Promise.all([
    supabase
      .from('project_stages')
      .select('id, name, order_position')
      .eq('project_id', projectId)
      .order('order_position', { ascending: true }),
    supabase
      .from('tasks')
      .select('id, stage_id, title, description_html, order_position, done')
      .eq('project_id', projectId)
  ]);

  if (stagesResult.error || tasksResult.error) {
    showMessage(
      messageElement,
      stagesResult.error?.message || tasksResult.error?.message || 'Failed to load project data.',
      'danger'
    );
    boardColumnsElement.innerHTML = '';
    return;
  }

  showMessage(messageElement, '');
  renderColumns(boardColumnsElement, stagesResult.data || [], tasksResult.data || []);
}

export async function renderDashboardPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const projectCards = page.querySelector('#projectCards');
  const boardColumnsElement = page.querySelector('#boardColumns');
  const messageElement = page.querySelector('#dashboardMessage');
  const signOutButton = page.querySelector('#dashboardSignOut');
  const projectDetailsLink = page.querySelector('#projectDetailsLink');
  const projectSearchInput = page.querySelector('#projectSearchInput');
  const summaryElements = {
    projectsCount: page.querySelector('#projectsCount'),
    tasksTotalCount: page.querySelector('#tasksTotalCount'),
    tasksPendingCount: page.querySelector('#tasksPendingCount'),
    tasksDoneCount: page.querySelector('#tasksDoneCount')
  };
  const projectModalElement = page.querySelector('#projectModal');
  const projectModalForm = page.querySelector('#projectModalForm');
  const projectModalTitle = page.querySelector('#projectModalLabel');
  const projectModalId = page.querySelector('#projectModalId');
  const projectModalName = page.querySelector('#projectModalName');
  const projectModalNameFeedback = page.querySelector('#projectModalNameFeedback');
  const projectModalDescription = page.querySelector('#projectModalDescription');
  const projectModalTemplateSection = page.querySelector('#projectTemplateSection');
  const projectModalTemplate = page.querySelector('#projectTemplate');
  const projectModalTemplateReadonlyHint = page.querySelector('#projectTemplateReadonlyHint');
  const projectModalTemplatePreview = page.querySelector('#projectTemplatePreview');
  const projectModalAssignSection = page.querySelector('#projectAssignSection');
  const projectModalUserSearch = page.querySelector('#projectUserSearch');
  const projectModalUsersList = page.querySelector('#projectUsersList');
  const projectModalSelectedUsersCount = page.querySelector('#projectSelectedUsersCount');
  const projectModalSubmit = page.querySelector('#projectModalSubmit');
  const projectModalSubmitAndTasks = page.querySelector('#projectModalSubmitAndTasks');
  const deleteProjectModalElement = page.querySelector('#deleteProjectModal');
  const deleteProjectName = page.querySelector('#deleteProjectName');
  const confirmDeleteProject = page.querySelector('#confirmDeleteProject');

  const projectModal = new Modal(projectModalElement);
  const deleteProjectModal = new Modal(deleteProjectModalElement);

  setProjectLink(projectDetailsLink, '');

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  signOutButton.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login/';
  });

  let projects = [];
  let selectedProjectId = '';
  let pendingDeleteProject = null;
  let projectTaskStats = new Map();
  let searchTerm = '';
  let projectModalMode = 'create';
  let allAssignableUsers = [];
  const selectedUserIds = new Set();
  let editStageNames = [];

  const renderTemplatePreview = () => {
    const stages =
      projectModalMode === 'edit'
        ? editStageNames
        : PROJECT_STAGE_TEMPLATES[projectModalTemplate?.value || 'basic'] || PROJECT_STAGE_TEMPLATES.basic;

    projectModalTemplatePreview.innerHTML = stages
      .map((stageName) => `<div class="project-template-stage">${escapeHtml(stageName)}</div>`)
      .join('');
  };

  const renderAssignableUsers = () => {
    const searchValue = String(projectModalUserSearch?.value || '').trim().toLowerCase();

    const filteredUsers = allAssignableUsers.filter((user) => {
      if (!searchValue) {
        return true;
      }

      return String(user.email || '').toLowerCase().includes(searchValue);
    });

    if (!filteredUsers.length) {
      projectModalUsersList.innerHTML = '<div class="text-body-secondary px-3 py-2">No users found.</div>';
      projectModalSelectedUsersCount.textContent = String(selectedUserIds.size);
      return;
    }

    projectModalUsersList.innerHTML = filteredUsers
      .map((user) => {
        const checked = selectedUserIds.has(user.id) ? 'checked' : '';

        return `
          <label class="project-user-item">
            <input type="checkbox" class="form-check-input mt-0" data-user-id="${user.id}" ${checked} />
            <span>${escapeHtml(user.email || 'Unknown')}</span>
          </label>
        `;
      })
      .join('');

    projectModalSelectedUsersCount.textContent = String(selectedUserIds.size);
  };

  const loadAssignableUsers = async () => {
    projectModalUsersList.innerHTML = '<div class="text-body-secondary px-3 py-2">Loading users...</div>';

    const { data, error } = await supabase.from('profiles').select('id, email').order('email', { ascending: true });

    if (error) {
      projectModalUsersList.innerHTML = '<div class="text-danger px-3 py-2">Failed to load users.</div>';
      showMessage(messageElement, error.message || 'Failed to load users for assignment.', 'warning');
      return;
    }

    allAssignableUsers = (data || []).filter((user) => user.id !== session.user.id);
    renderAssignableUsers();
  };

  const openProjectModal = async (mode, project = null) => {
    const isEdit = mode === 'edit';
    projectModalMode = isEdit ? 'edit' : 'create';
    projectModalTitle.textContent = isEdit ? 'Edit project' : 'Create project';
    projectModalSubmit.textContent = isEdit ? 'Save changes' : 'Create project';
    projectModalSubmitAndTasks.textContent = isEdit ? 'Save & Open Tasks' : 'Create & Add Tasks';
    projectModalId.value = project?.id || '';
    projectModalName.value = project?.name || '';
    projectModalDescription.value = project?.description || '';
    clearFieldError(projectModalName, projectModalNameFeedback);
    projectModalUserSearch.value = '';
    selectedUserIds.clear();
    editStageNames = [];

    projectModalTemplateSection.classList.remove('d-none');
    projectModalAssignSection.classList.remove('d-none');
    projectModalSubmitAndTasks.classList.remove('d-none');

    if (isEdit) {
      projectModalTemplate.disabled = true;
      projectModalTemplateReadonlyHint.classList.remove('d-none');

      const [stagesResult, membersResult] = await Promise.all([
        supabase.from('project_stages').select('name, order_position').eq('project_id', project.id).order('order_position', { ascending: true }),
        supabase.from('project_members').select('user_id').eq('project_id', project.id)
      ]);

      if (stagesResult.error) {
        showMessage(messageElement, stagesResult.error.message || 'Failed to load project stages.', 'warning');
      } else {
        editStageNames = (stagesResult.data || []).map((stage) => stage.name);
      }

      await loadAssignableUsers();

      if (membersResult.error) {
        showMessage(messageElement, membersResult.error.message || 'Failed to load assigned users.', 'warning');
      } else {
        (membersResult.data || []).forEach((member) => {
          if (member.user_id) {
            selectedUserIds.add(member.user_id);
          }
        });
      }

      renderAssignableUsers();
      renderTemplatePreview();
    } else {
      projectModalTemplate.disabled = false;
      projectModalTemplateReadonlyHint.classList.add('d-none');
      renderTemplatePreview();
      await loadAssignableUsers();
    }

    projectModal.show();
  };

  const renderProjectCards = () => {
    const normalizedSearch = searchTerm.toLowerCase();
    const filteredProjects = projects.filter((project) => {
      if (!normalizedSearch) {
        return true;
      }

      const name = String(project.name || '').toLowerCase();
      const description = String(project.description || '').toLowerCase();
      return name.includes(normalizedSearch) || description.includes(normalizedSearch);
    });

    if (selectedProjectId && !filteredProjects.some((project) => project.id === selectedProjectId)) {
      selectedProjectId = filteredProjects[0]?.id || '';
    }

    const cards = filteredProjects
      .map((project) => {
        const isActive = project.id === selectedProjectId;
        const isOwner = project.owner_id === session.user.id;
        const safeName = escapeHtml(project.name);
        const safeDescription = escapeHtml(truncateText(project.description));
        const taskStats = projectTaskStats.get(project.id) || { open: 0, done: 0 };

        return `
          <article class="project-card ${isActive ? 'active' : ''}" data-project-id="${project.id}">
            <button
              type="button"
              class="project-card-select"
              data-action="select"
              data-project-id="${project.id}"
              aria-pressed="${isActive ? 'true' : 'false'}"
            >
              <span class="project-card-title">${safeName}</span>
              ${safeDescription ? `<span class="project-card-description">${safeDescription}</span>` : ''}
              <span class="project-card-badges">
                <span class="badge text-bg-light">Open ${taskStats.open}</span>
                <span class="badge text-bg-light">Done ${taskStats.done}</span>
              </span>
            </button>
            ${
              isOwner
                ? `
                <div class="project-card-actions" aria-label="Project actions">
                  <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-project-id="${project.id}" title="Edit project" aria-label="Edit project">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-project-id="${project.id}" title="Delete project" aria-label="Delete project">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              `
                : ''
            }
          </article>
        `;
      })
      .join('');

    projectCards.innerHTML = `
      ${cards}
      <article class="project-card project-card-create">
        <button type="button" class="project-create-button" data-action="create">+ Create New Project</button>
      </article>
    `;

    if (!filteredProjects.length) {
      projectCards.innerHTML = `
        <article class="project-card">
          <span class="text-body-secondary">No matching projects.</span>
        </article>
        <article class="project-card project-card-create">
          <button type="button" class="project-create-button" data-action="create">+ Create New Project</button>
        </article>
      `;
    }
  };

  const refreshDashboard = async (preferredProjectId = '') => {
    showMessage(messageElement, 'Loading projects...', 'secondary');

    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, description, owner_id')
      .order('created_at', { ascending: true });

    if (projectsError) {
      showMessage(messageElement, projectsError.message, 'danger');
      return;
    }

    projects = projectsData || [];

    if (!projects.length) {
      selectedProjectId = '';
      renderProjectCards();
      setSummaryCounts(summaryElements, 0, []);
      setProjectLink(projectDetailsLink, '');
      boardColumnsElement.innerHTML = '';
      showMessage(messageElement, 'No projects found for your account.', 'warning');
      return;
    }

    const hasPreferred = preferredProjectId && projects.some((project) => project.id === preferredProjectId);
    const hasCurrent = selectedProjectId && projects.some((project) => project.id === selectedProjectId);

    selectedProjectId = hasPreferred ? preferredProjectId : hasCurrent ? selectedProjectId : projects[0].id;

    const projectIds = projects.map((project) => project.id);
    const { data: allUserTasks, error: allUserTasksError } = await supabase
      .from('tasks')
      .select('project_id, done')
      .in('project_id', projectIds);

    if (allUserTasksError) {
      showMessage(messageElement, allUserTasksError.message, 'danger');
      return;
    }

    const taskItems = allUserTasks || [];
    projectTaskStats = new Map();

    taskItems.forEach((task) => {
      if (!projectTaskStats.has(task.project_id)) {
        projectTaskStats.set(task.project_id, { open: 0, done: 0 });
      }

      const stats = projectTaskStats.get(task.project_id);
      if (task.done) {
        stats.done += 1;
      } else {
        stats.open += 1;
      }
    });

    setSummaryCounts(summaryElements, projects.length, taskItems);
    renderProjectCards();
    setProjectLink(projectDetailsLink, selectedProjectId);
    await loadProjectData(selectedProjectId, boardColumnsElement, messageElement);
  };

  projectSearchInput.addEventListener('input', async () => {
    searchTerm = projectSearchInput.value.trim();
    renderProjectCards();
    setProjectLink(projectDetailsLink, selectedProjectId);
    await loadProjectData(selectedProjectId, boardColumnsElement, messageElement);
  });

  projectCards.addEventListener('click', async (event) => {
    const actionElement = event.target.closest('[data-action]');

    if (!actionElement) {
      return;
    }

    const action = actionElement.getAttribute('data-action');
    const projectId = actionElement.getAttribute('data-project-id');

    if (action === 'create') {
      await openProjectModal('create');
      return;
    }

    if (action === 'select') {
      if (!projectId || projectId === selectedProjectId) {
        return;
      }

      selectedProjectId = projectId;
      renderProjectCards();
      setProjectLink(projectDetailsLink, selectedProjectId);
      await loadProjectData(selectedProjectId, boardColumnsElement, messageElement);
      return;
    }

    const targetProject = projects.find((project) => project.id === projectId);

    if (!targetProject) {
      return;
    }

    if (action === 'edit') {
      await openProjectModal('edit', targetProject);
      return;
    }

    if (action === 'delete') {
      pendingDeleteProject = targetProject;
      deleteProjectName.textContent = targetProject.name;
      deleteProjectModal.show();
    }
  });

  projectModalTemplate.addEventListener('change', renderTemplatePreview);

  projectModalUsersList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-user-id]');

    if (!checkbox) {
      return;
    }

    const userId = checkbox.getAttribute('data-user-id');
    if (!userId) {
      return;
    }

    if (checkbox.checked) {
      selectedUserIds.add(userId);
    } else {
      selectedUserIds.delete(userId);
    }

    projectModalSelectedUsersCount.textContent = String(selectedUserIds.size);
  });

  projectModalUserSearch.addEventListener('input', () => {
    renderAssignableUsers();
  });

  projectModalName.addEventListener('input', () => {
    const validation = validateProjectName(projectModalName.value);

    if (validation.valid || !String(projectModalName.value || '').trim()) {
      clearFieldError(projectModalName, projectModalNameFeedback);
    }
  });

  projectModalForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const projectId = projectModalId.value.trim();
    const submitter = event.submitter;
    const shouldOpenTasksAfterSubmit = submitter?.getAttribute('data-after-submit') === 'tasks';
    const name = projectModalName.value.trim();
    const description = projectModalDescription.value.trim();
    const nameValidation = validateProjectName(name);

    if (!nameValidation.valid) {
      setFieldError(projectModalName, projectModalNameFeedback, nameValidation.message);
      showMessage(messageElement, nameValidation.message, 'warning');
      projectModalName.focus();
      return;
    }

    clearFieldError(projectModalName, projectModalNameFeedback);

    const duplicateCheck = await hasDuplicateProjectName(session.user.id, name, projectId || null);
    if (duplicateCheck.error) {
      showMessage(messageElement, duplicateCheck.error.message || 'Failed to validate project name.', 'danger');
      return;
    }

    if (duplicateCheck.duplicate) {
      const duplicateMessage = 'You already have a project with this title. Please choose another name.';
      setFieldError(projectModalName, projectModalNameFeedback, duplicateMessage);
      showMessage(messageElement, duplicateMessage, 'warning');
      projectModalName.focus();
      return;
    }

    projectModalSubmit.disabled = true;
    projectModalSubmitAndTasks.disabled = true;

    if (projectId) {
      const { error } = await supabase
        .from('projects')
        .update({ name, description })
        .eq('id', projectId)
        .eq('owner_id', session.user.id);

      if (error) {
        projectModalSubmit.disabled = false;
        projectModalSubmitAndTasks.disabled = false;
        showMessage(messageElement, error.message, 'danger');
        return;
      }

      const { data: existingMembers, error: existingMembersError } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId);

      if (existingMembersError) {
        projectModalSubmit.disabled = false;
        projectModalSubmitAndTasks.disabled = false;
        showMessage(messageElement, existingMembersError.message, 'danger');
        return;
      }

      const existingMemberIds = new Set((existingMembers || []).map((member) => member.user_id).filter(Boolean));
      const membersToInsert = [...selectedUserIds]
        .filter((userId) => !existingMemberIds.has(userId))
        .map((userId) => ({
          project_id: projectId,
          user_id: userId
        }));
      const membersToDelete = [...existingMemberIds].filter((userId) => !selectedUserIds.has(userId));

      if (membersToInsert.length) {
        const { error: insertMembersError } = await supabase.from('project_members').insert(membersToInsert);

        if (insertMembersError) {
          projectModalSubmit.disabled = false;
          projectModalSubmitAndTasks.disabled = false;
          showMessage(messageElement, insertMembersError.message, 'danger');
          return;
        }
      }

      if (membersToDelete.length) {
        const { error: deleteMembersError } = await supabase
          .from('project_members')
          .delete()
          .eq('project_id', projectId)
          .in('user_id', membersToDelete);

        if (deleteMembersError) {
          projectModalSubmit.disabled = false;
          projectModalSubmitAndTasks.disabled = false;
          showMessage(messageElement, deleteMembersError.message, 'danger');
          return;
        }
      }

      projectModalSubmit.disabled = false;
      projectModalSubmitAndTasks.disabled = false;

      projectModal.hide();
      showMessage(messageElement, 'Project updated.', 'success');

      if (shouldOpenTasksAfterSubmit) {
        window.location.href = `/project/${projectId}/tasks`;
        return;
      }

      await refreshDashboard(projectId);
      return;
    }

    const { data: createdProject, error } = await supabase
      .from('projects')
      .insert({
        name,
        description,
        owner_id: session.user.id
      })
      .select('id')
      .single();

    projectModalSubmit.disabled = false;
    projectModalSubmitAndTasks.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    const selectedTemplateKey = projectModalTemplate?.value || 'basic';
    const selectedTemplateStages = PROJECT_STAGE_TEMPLATES[selectedTemplateKey] || PROJECT_STAGE_TEMPLATES.basic;
    const { error: stagesError } = await createProjectStages(createdProject.id, selectedTemplateStages);

    if (stagesError) {
      showMessage(messageElement, stagesError.message || 'Project created, but default stages could not be created.', 'danger');
      return;
    }

    if (projectModalMode === 'create' && selectedUserIds.size > 0) {
      const membersToInsert = [...selectedUserIds].map((userId) => ({
        project_id: createdProject.id,
        user_id: userId
      }));

      const { error: membersError } = await supabase.from('project_members').insert(membersToInsert);

      if (membersError) {
        showMessage(messageElement, `Project created, but assigning users failed: ${membersError.message}`, 'warning');
      }
    }

    projectModal.hide();
    showMessage(messageElement, 'Project created.', 'success');

    if (shouldOpenTasksAfterSubmit && createdProject?.id) {
      window.location.href = `/project/${createdProject.id}/tasks`;
      return;
    }

    await refreshDashboard(createdProject?.id || '');
  });

  confirmDeleteProject.addEventListener('click', async () => {
    if (!pendingDeleteProject?.id) {
      return;
    }

    confirmDeleteProject.disabled = true;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', pendingDeleteProject.id)
      .eq('owner_id', session.user.id);

    confirmDeleteProject.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    const deletedProjectId = pendingDeleteProject.id;
    pendingDeleteProject = null;
    deleteProjectModal.hide();
    showMessage(messageElement, 'Project deleted.', 'success');

    const nextProject = projects.find((project) => project.id !== deletedProjectId);
    await refreshDashboard(nextProject?.id || '');
  });

  await refreshDashboard();
  return page;
}
