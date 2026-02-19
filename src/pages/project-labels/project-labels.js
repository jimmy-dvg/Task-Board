import template from './project-labels.html?raw';
import './project-labels.css';
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
  const pathMatch = window.location.pathname.match(/^\/project\/([^/]+)\/labels\/?$/);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('id');
}

export async function renderProjectLabelsPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#labelsMessage');
  const projectNameElement = page.querySelector('#labelsProjectName');
  const labelsBoardLink = page.querySelector('#labelsBoardLink');
  const labelsFilterList = page.querySelector('#labelsFilterList');
  const tasksTableBody = page.querySelector('#labelsTasksTableBody');

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  const projectId = resolveProjectIdFromLocation();

  if (!projectId) {
    showMessage(messageElement, 'Missing project id. Open this page from a project.', 'warning');
    tasksTableBody.innerHTML = '<tr><td colspan="4" class="text-body-secondary">Project id is missing.</td></tr>';
    return page;
  }

  labelsBoardLink.href = `/project/${projectId}/tasks`;

  showMessage(messageElement, 'Loading labels...', 'secondary');

  const [projectResult, stagesResult, tasksResult, labelsResult, taskLabelsResult] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).single(),
    supabase.from('project_stages').select('id, name').eq('project_id', projectId),
    supabase
      .from('tasks')
      .select('id, title, stage_id, done, order_position')
      .eq('project_id', projectId),
    supabase
      .from('project_labels')
      .select('id, name')
      .eq('project_id', projectId)
      .order('name', { ascending: true }),
    supabase.from('task_labels').select('task_id, label_id')
  ]);

  if (projectResult.error || stagesResult.error || tasksResult.error || labelsResult.error || taskLabelsResult.error) {
    showMessage(
      messageElement,
      projectResult.error?.message ||
        stagesResult.error?.message ||
        tasksResult.error?.message ||
        labelsResult.error?.message ||
        taskLabelsResult.error?.message ||
        'Failed to load labels.',
      'danger'
    );
    tasksTableBody.innerHTML = '<tr><td colspan="4" class="text-body-secondary">Unable to load tasks.</td></tr>';
    return page;
  }

  const project = projectResult.data;
  const stages = stagesResult.data || [];
  const tasks = tasksResult.data || [];
  const labels = labelsResult.data || [];
  const stageById = new Map(stages.map((stage) => [stage.id, stage.name]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const tasksByLabelId = new Map();

  (taskLabelsResult.data || []).forEach((taskLabel) => {
    if (!taskById.has(taskLabel.task_id) || !labelById.has(taskLabel.label_id)) {
      return;
    }

    if (!tasksByLabelId.has(taskLabel.label_id)) {
      tasksByLabelId.set(taskLabel.label_id, []);
    }

    tasksByLabelId.get(taskLabel.label_id).push(taskById.get(taskLabel.task_id));
  });

  tasksByLabelId.forEach((labelTasks) => {
    labelTasks.sort((firstTask, secondTask) => firstTask.order_position - secondTask.order_position);
  });

  projectNameElement.textContent = project?.name ? `Project: ${project.name}` : 'Project';

  if (!labels.length) {
    labelsFilterList.innerHTML = '<small class="text-body-secondary">No labels yet. Add labels from task editor.</small>';
    tasksTableBody.innerHTML = '<tr><td colspan="4" class="text-body-secondary">No labels found for this project.</td></tr>';
    showMessage(messageElement, '');
    return page;
  }

  let activeLabelId = labels[0].id;

  const renderRows = () => {
    const selectedTasks = tasksByLabelId.get(activeLabelId) || [];

    if (!selectedTasks.length) {
      tasksTableBody.innerHTML = '<tr><td colspan="4" class="text-body-secondary">No tasks for this label.</td></tr>';
      return;
    }

    tasksTableBody.innerHTML = selectedTasks
      .map((task) => {
        const safeTitle = escapeHtml(task.title || 'Untitled');
        const stageName = escapeHtml(stageById.get(task.stage_id) || 'Unknown');
        const status = task.done ? 'Done' : 'Open';

        return `
          <tr>
            <td>${safeTitle}</td>
            <td>${stageName}</td>
            <td>${status}</td>
            <td class="text-end">
              <a class="btn btn-sm btn-outline-secondary" href="/project/${projectId}/tasks">Open Board</a>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const renderLabelFilters = () => {
    labelsFilterList.innerHTML = labels
      .map((label) => {
        const isActive = label.id === activeLabelId;
        const count = (tasksByLabelId.get(label.id) || []).length;

        return `
          <button
            type="button"
            class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-primary'} label-filter-btn"
            data-action="select-label"
            data-label-id="${label.id}"
          >
            ${escapeHtml(label.name)}
            <span class="label-filter-count">(${count})</span>
          </button>
        `;
      })
      .join('');
  };

  labelsFilterList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="select-label"]');
    if (!button) {
      return;
    }

    const labelId = button.getAttribute('data-label-id');
    if (!labelId || labelId === activeLabelId) {
      return;
    }

    activeLabelId = labelId;
    renderLabelFilters();
    renderRows();
  });

  renderLabelFilters();
  renderRows();
  showMessage(messageElement, '');

  return page;
}
