import template from './projects.html?raw';
import './projects.css';
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

function buildStats(tasks = [], stages = []) {
  const openTasks = tasks.filter((task) => !task.done).length;
  const doneTasks = tasks.filter((task) => task.done).length;

  return {
    openTasks,
    doneTasks,
    stagesCount: stages.length
  };
}

export async function renderProjectsPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#projectsMessage');
  const tableBody = page.querySelector('#projectsTableBody');
  const deleteProjectNameElement = page.querySelector('#deleteProjectName');
  const confirmDeleteButton = page.querySelector('#confirmDeleteProject');
  const deleteModalElement = page.querySelector('#deleteProjectModal');

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  let pendingDeleteProject = null;
  const deleteModal = new Modal(deleteModalElement);

  const renderRows = (projects, tasksByProject, stagesByProject) => {
    if (!projects.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No projects yet. Create your first project.</td></tr>';
      return;
    }

    tableBody.innerHTML = '';

    projects.forEach((project) => {
      const row = document.createElement('tr');
      const stats = buildStats(tasksByProject.get(project.id), stagesByProject.get(project.id));
      const safeName = escapeHtml(project.name);

      row.innerHTML = `
        <td class="project-title">${safeName}</td>
        <td>${stats.openTasks}</td>
        <td>${stats.doneTasks}</td>
        <td>${stats.stagesCount}</td>
        <td class="text-end">
          <div class="actions-group">
            <a class="btn btn-sm btn-outline-primary" href="/project/${project.id}/edit">Edit</a>
            <a class="btn btn-sm btn-outline-secondary" href="/project/${project.id}/tasks">View Tasks</a>
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-project-id="${project.id}" data-project-name="${safeName}">
              Delete
            </button>
          </div>
        </td>
      `;

      tableBody.append(row);
    });
  };

  const loadProjects = async () => {
    showMessage(messageElement, 'Loading projects...', 'secondary');

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: true });

    if (projectsError) {
      showMessage(messageElement, projectsError.message, 'danger');
      return;
    }

    const projectIds = (projects || []).map((project) => project.id);

    if (!projectIds.length) {
      renderRows([], new Map(), new Map());
      showMessage(messageElement, '');
      return;
    }

    const [tasksResult, stagesResult] = await Promise.all([
      supabase.from('tasks').select('project_id, done').in('project_id', projectIds),
      supabase.from('project_stages').select('project_id').in('project_id', projectIds)
    ]);

    if (tasksResult.error || stagesResult.error) {
      showMessage(messageElement, tasksResult.error?.message || stagesResult.error?.message || 'Failed to load project details.', 'danger');
      return;
    }

    const tasksByProject = new Map();
    const stagesByProject = new Map();

    (tasksResult.data || []).forEach((task) => {
      if (!tasksByProject.has(task.project_id)) {
        tasksByProject.set(task.project_id, []);
      }

      tasksByProject.get(task.project_id).push(task);
    });

    (stagesResult.data || []).forEach((stage) => {
      if (!stagesByProject.has(stage.project_id)) {
        stagesByProject.set(stage.project_id, []);
      }

      stagesByProject.get(stage.project_id).push(stage);
    });

    renderRows(projects || [], tasksByProject, stagesByProject);
    showMessage(messageElement, '');
  };

  page.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-action="delete"]');

    if (!deleteButton) {
      return;
    }

    pendingDeleteProject = {
      id: deleteButton.getAttribute('data-project-id'),
      name: deleteButton.getAttribute('data-project-name')
    };

    deleteProjectNameElement.textContent = pendingDeleteProject.name || 'this project';
    deleteModal.show();
  });

  confirmDeleteButton.addEventListener('click', async () => {
    if (!pendingDeleteProject?.id) {
      return;
    }

    confirmDeleteButton.disabled = true;
    showMessage(messageElement, 'Deleting project...', 'secondary');

    const { error } = await supabase.from('projects').delete().eq('id', pendingDeleteProject.id);

    confirmDeleteButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    deleteModal.hide();
    showMessage(messageElement, 'Project deleted.', 'success');
    pendingDeleteProject = null;
    await loadProjects();
  });

  await loadProjects();
  return page;
}
