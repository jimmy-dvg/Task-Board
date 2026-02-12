import template from './project-form.html?raw';
import './project-form.css';
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

function parseProjectRoute(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '');
  const match = cleanPath.match(/^\/project\/([^/]+)\/(add|edit)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    mode: match[2]
  };
}

export async function renderProjectFormPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const titleElement = page.querySelector('#projectFormTitle');
  const messageElement = page.querySelector('#projectFormMessage');
  const formElement = page.querySelector('#projectForm');
  const nameInput = page.querySelector('#projectName');
  const submitButton = page.querySelector('#projectFormSubmit');

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

  if (isEditMode) {
    titleElement.textContent = 'Edit Project';
    submitButton.textContent = 'Update';

    showMessage(messageElement, 'Loading project...', 'secondary');

    const { data: project, error } = await supabase.from('projects').select('id, name').eq('id', route.projectId).single();

    if (error) {
      showMessage(messageElement, error.message || 'Failed to load project.', 'danger');
      formElement.classList.add('d-none');
      return page;
    }

    nameInput.value = project?.name || '';
    showMessage(messageElement, '');
  }

  if (isAddMode) {
    titleElement.textContent = 'Add Project';
    submitButton.textContent = 'Create';
  }

  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();

    const projectName = nameInput.value.trim();

    if (!projectName) {
      showMessage(messageElement, 'Project title is required.', 'warning');
      return;
    }

    submitButton.disabled = true;

    if (isEditMode) {
      showMessage(messageElement, 'Updating project...', 'secondary');

      const { error } = await supabase
        .from('projects')
        .update({ name: projectName })
        .eq('id', route.projectId)
        .eq('owner_id', session.user.id);

      submitButton.disabled = false;

      if (error) {
        showMessage(messageElement, error.message, 'danger');
        return;
      }

      window.location.href = '/projects/';
      return;
    }

    showMessage(messageElement, 'Creating project...', 'secondary');

    const { error } = await supabase.from('projects').insert({
      name: projectName,
      owner_id: session.user.id
    });

    submitButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    window.location.href = '/projects/';
  });

  return page;
}
