import template from './project-form.html?raw';
import './project-form.css';
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

function parseProjectRoute(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '');

  if (cleanPath === '/projects/new') {
    return {
      projectId: null,
      mode: 'add'
    };
  }

  const match = cleanPath.match(/^\/projects\/([^/]+)\/edit$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    mode: 'edit'
  };
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

export async function renderProjectFormPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const titleElement = page.querySelector('#projectFormTitle');
  const messageElement = page.querySelector('#projectFormMessage');
  const formElement = page.querySelector('#projectForm');
  const nameInput = page.querySelector('#projectName');
  const descriptionInput = page.querySelector('#projectDescription');
  const nameInputFeedback = page.querySelector('#projectNameFeedback');
  const templateSection = page.querySelector('#projectTemplateSection');
  const templateSelect = page.querySelector('#projectTemplate');
  const templatePreview = page.querySelector('#projectTemplatePreview');
  const assignSection = page.querySelector('#projectAssignSection');
  const userSearchInput = page.querySelector('#projectUserSearch');
  const usersListElement = page.querySelector('#projectUsersList');
  const selectedUsersCountElement = page.querySelector('#projectSelectedUsersCount');
  const submitButton = page.querySelector('#projectFormSubmit');
  const submitAndTasksButton = page.querySelector('#projectFormSubmitAndTasks');

  let allUsers = [];
  const selectedUserIds = new Set();

  const route = parseProjectRoute(window.location.pathname);

  if (!route) {
    showMessage(messageElement, 'Invalid project form URL.', 'danger');
    formElement.classList.add('d-none');
    return page;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  const isEditMode = route.mode === 'edit';
  const isAddMode = route.mode === 'add';

  const renderTemplatePreview = () => {
    const selectedTemplateKey = templateSelect?.value || 'basic';
    const stages = PROJECT_STAGE_TEMPLATES[selectedTemplateKey] || PROJECT_STAGE_TEMPLATES.basic;

    templatePreview.innerHTML = stages
      .map((stageName) => `<div class="project-template-stage">${stageName}</div>`)
      .join('');
  };

  if (templateSelect && templatePreview) {
    templateSelect.addEventListener('change', renderTemplatePreview);
    renderTemplatePreview();
  }

  if (isEditMode) {
    titleElement.textContent = 'Edit Project';
    submitButton.textContent = 'Update';
    submitAndTasksButton.classList.add('d-none');

    showMessage(messageElement, 'Loading project...', 'secondary');

    const { data: project, error } = await supabase.from('projects').select('id, name, description').eq('id', route.projectId).single();

    if (error) {
      showMessage(messageElement, error.message || 'Failed to load project.', 'danger');
      formElement.classList.add('d-none');
      return page;
    }

    nameInput.value = project?.name || '';
    descriptionInput.value = project?.description || '';
    templateSection.classList.add('d-none');
    assignSection.classList.add('d-none');
    showMessage(messageElement, '');
  }

  if (isAddMode) {
    titleElement.textContent = 'Add Project';
    submitButton.textContent = 'Create';
    submitAndTasksButton.classList.remove('d-none');
    templateSection.classList.remove('d-none');
    assignSection.classList.remove('d-none');
  }

  const renderAssignableUsers = () => {
    const searchValue = String(userSearchInput?.value || '').trim().toLowerCase();

    const filteredUsers = allUsers.filter((user) => {
      if (!searchValue) {
        return true;
      }

      return String(user.email || '').toLowerCase().includes(searchValue);
    });

    if (!filteredUsers.length) {
      usersListElement.innerHTML = '<div class="text-body-secondary px-3 py-2">No users found.</div>';
      selectedUsersCountElement.textContent = String(selectedUserIds.size);
      return;
    }

    usersListElement.innerHTML = filteredUsers
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

    selectedUsersCountElement.textContent = String(selectedUserIds.size);
  };

  const loadAssignableUsers = async () => {
    usersListElement.innerHTML = '<div class="text-body-secondary px-3 py-2">Loading users...</div>';

    const { data, error } = await supabase.from('profiles').select('id, email').order('email', { ascending: true });

    if (error) {
      usersListElement.innerHTML = '<div class="text-danger px-3 py-2">Failed to load users.</div>';
      showMessage(messageElement, error.message || 'Failed to load users for assignment.', 'warning');
      return;
    }

    allUsers = (data || []).filter((user) => user.id !== session.user.id);
    renderAssignableUsers();
  };

  if (isAddMode) {
    await loadAssignableUsers();
  }

  usersListElement.addEventListener('change', (event) => {
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

    selectedUsersCountElement.textContent = String(selectedUserIds.size);
  });

  userSearchInput.addEventListener('input', () => {
    renderAssignableUsers();
  });

  nameInput.addEventListener('input', () => {
    const validation = validateProjectName(nameInput.value);

    if (validation.valid) {
      clearFieldError(nameInput, nameInputFeedback);
      return;
    }

    if (!String(nameInput.value || '').trim()) {
      clearFieldError(nameInput, nameInputFeedback);
    }
  });

  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitter = event.submitter;
    const shouldOpenTasksAfterCreate = submitter?.getAttribute('data-after-create') === 'tasks';

    const projectName = nameInput.value.trim();
    const projectDescription = String(descriptionInput.value || '').trim();
    const validation = validateProjectName(projectName);

    if (!validation.valid) {
      setFieldError(nameInput, nameInputFeedback, validation.message);
      showMessage(messageElement, validation.message, 'warning');
      nameInput.focus();
      return;
    }

    clearFieldError(nameInput, nameInputFeedback);

    const duplicateCheck = await hasDuplicateProjectName(session.user.id, projectName, route.projectId);
    if (duplicateCheck.error) {
      showMessage(messageElement, duplicateCheck.error.message || 'Failed to validate project name.', 'danger');
      return;
    }

    if (duplicateCheck.duplicate) {
      const duplicateMessage = 'You already have a project with this title. Please choose another name.';
      setFieldError(nameInput, nameInputFeedback, duplicateMessage);
      showMessage(messageElement, duplicateMessage, 'warning');
      nameInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitAndTasksButton.disabled = true;

    if (isEditMode) {
      showMessage(messageElement, 'Updating project...', 'secondary');

      const { error } = await supabase
        .from('projects')
        .update({
          name: projectName,
          description: projectDescription
        })
        .eq('id', route.projectId)
        .eq('owner_id', session.user.id);

      submitButton.disabled = false;
      submitAndTasksButton.disabled = false;

      if (error) {
        showMessage(messageElement, error.message, 'danger');
        return;
      }

      window.location.href = '/projects/';
      return;
    }

    showMessage(messageElement, 'Creating project...', 'secondary');

    const { data: createdProject, error } = await supabase
      .from('projects')
      .insert({
        name: projectName,
        description: projectDescription,
        owner_id: session.user.id
      })
      .select('id')
      .single();

    submitButton.disabled = false;
    submitAndTasksButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    const selectedTemplateKey = templateSelect?.value || 'basic';
    const selectedTemplateStages = PROJECT_STAGE_TEMPLATES[selectedTemplateKey] || PROJECT_STAGE_TEMPLATES.basic;
    const { error: defaultStagesError } = await createProjectStages(createdProject.id, selectedTemplateStages);

    if (defaultStagesError) {
      showMessage(messageElement, defaultStagesError.message || 'Project created, but default stages could not be created.', 'danger');
      return;
    }

    if (selectedUserIds.size > 0) {
      const membersToInsert = [...selectedUserIds].map((userId) => ({
        project_id: createdProject.id,
        user_id: userId
      }));

      const { error: membersError } = await supabase.from('project_members').insert(membersToInsert);

      if (membersError) {
        showMessage(messageElement, `Project created, but assigning users failed: ${membersError.message}`, 'warning');
      }
    }

    if (shouldOpenTasksAfterCreate && createdProject?.id) {
      window.location.href = `/project/${createdProject.id}/tasks`;
      return;
    }

    window.location.href = '/projects/';
  });

  return page;
}
