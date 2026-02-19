import template from './project-deadlines.html?raw';
import './project-deadlines.css';
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
  const pathMatch = window.location.pathname.match(/^\/project\/([^/]+)\/deadlines\/?$/);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('id');
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(isoDate, daysToAdd) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDeadlineDate(deadlineDate) {
  const value = String(deadlineDate || '').trim();
  if (!value) {
    return 'No deadline';
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString();
}

function matchesFilter(task, filterValue, todayIsoDate, sevenDaysIsoDate) {
  const deadlineDate = String(task.deadline_date || '').trim();

  if (filterValue === 'none') {
    return !deadlineDate;
  }

  if (!deadlineDate) {
    return filterValue === 'all';
  }

  if (filterValue === 'overdue') {
    return !task.done && deadlineDate < todayIsoDate;
  }

  if (filterValue === 'today') {
    return deadlineDate === todayIsoDate;
  }

  if (filterValue === 'next7') {
    return deadlineDate >= todayIsoDate && deadlineDate <= sevenDaysIsoDate;
  }

  return true;
}

export async function renderProjectDeadlinesPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#deadlinesMessage');
  const projectNameElement = page.querySelector('#deadlinesProjectName');
  const deadlinesBoardLink = page.querySelector('#deadlinesBoardLink');
  const deadlineFilterElement = page.querySelector('#deadlineFilter');
  const tasksTableBody = page.querySelector('#deadlinesTasksTableBody');

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
    tasksTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Project id is missing.</td></tr>';
    return page;
  }

  deadlinesBoardLink.href = `/project/${projectId}/tasks`;

  showMessage(messageElement, 'Loading deadlines...', 'secondary');

  const [projectResult, stagesResult, tasksResult] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).single(),
    supabase.from('project_stages').select('id, name').eq('project_id', projectId),
    supabase
      .from('tasks')
      .select('id, title, stage_id, done, deadline_date')
      .eq('project_id', projectId)
  ]);

  if (projectResult.error || stagesResult.error || tasksResult.error) {
    showMessage(
      messageElement,
      projectResult.error?.message || stagesResult.error?.message || tasksResult.error?.message || 'Failed to load deadlines.',
      'danger'
    );
    tasksTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Unable to load tasks.</td></tr>';
    return page;
  }

  const project = projectResult.data;
  const stages = stagesResult.data || [];
  const tasks = tasksResult.data || [];
  const stageById = new Map(stages.map((stage) => [stage.id, stage.name]));

  projectNameElement.textContent = project?.name ? `Project: ${project.name}` : 'Project';

  const renderRows = () => {
    const todayIsoDate = getTodayIsoDate();
    const sevenDaysIsoDate = addDays(todayIsoDate, 7);
    const selectedFilter = deadlineFilterElement.value || 'all';

    const filteredTasks = tasks
      .filter((task) => matchesFilter(task, selectedFilter, todayIsoDate, sevenDaysIsoDate))
      .sort((firstTask, secondTask) => {
        const firstDate = firstTask.deadline_date || '9999-12-31';
        const secondDate = secondTask.deadline_date || '9999-12-31';

        if (firstDate !== secondDate) {
          return firstDate.localeCompare(secondDate);
        }

        return String(firstTask.title || '').localeCompare(String(secondTask.title || ''), undefined, { sensitivity: 'base' });
      });

    if (!filteredTasks.length) {
      tasksTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No tasks for this deadline filter.</td></tr>';
      return;
    }

    tasksTableBody.innerHTML = filteredTasks
      .map((task) => {
        const safeTitle = escapeHtml(task.title || 'Untitled');
        const stageName = escapeHtml(stageById.get(task.stage_id) || 'Unknown');
        const status = task.done ? 'Done' : 'Open';
        const deadlineText = formatDeadlineDate(task.deadline_date);
        const isOverdue = !task.done && task.deadline_date && String(task.deadline_date) < todayIsoDate;

        return `
          <tr>
            <td>${safeTitle}</td>
            <td class="${isOverdue ? 'deadline-overdue' : ''}">${escapeHtml(deadlineText)}</td>
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

  deadlineFilterElement.addEventListener('change', renderRows);

  renderRows();
  showMessage(messageElement, '');

  return page;
}
