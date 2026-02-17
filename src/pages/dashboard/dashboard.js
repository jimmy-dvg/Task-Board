import template from './dashboard.html?raw';
import './dashboard.css';
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
  const summaryElements = {
    projectsCount: page.querySelector('#projectsCount'),
    tasksTotalCount: page.querySelector('#tasksTotalCount'),
    tasksPendingCount: page.querySelector('#tasksPendingCount'),
    tasksDoneCount: page.querySelector('#tasksDoneCount')
  };

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

  showMessage(messageElement, 'Loading projects...', 'secondary');

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true });

  if (projectsError) {
    showMessage(messageElement, projectsError.message, 'danger');
    return page;
  }

  if (!projects?.length) {
    showMessage(messageElement, 'No projects found for your account.', 'warning');
    projectCards.innerHTML = '<div class="text-body-secondary">No projects</div>';
    setSummaryCounts(summaryElements, 0, []);
    setProjectLink(projectDetailsLink, '');
    boardColumnsElement.innerHTML = '';
    return page;
  }

  const projectIds = projects.map((project) => project.id);
  const { data: allUserTasks, error: allUserTasksError } = await supabase
    .from('tasks')
    .select('done')
    .in('project_id', projectIds);

  if (allUserTasksError) {
    showMessage(messageElement, allUserTasksError.message, 'danger');
    return page;
  }

  setSummaryCounts(summaryElements, projects.length, allUserTasks || []);

  let selectedProjectId = projects[0].id;

  const renderProjectCards = () => {
    projectCards.innerHTML = projects
      .map((project) => {
        const isActive = project.id === selectedProjectId;

        return `
          <button
            type="button"
            class="project-card ${isActive ? 'active' : ''}"
            data-project-id="${project.id}"
            aria-pressed="${isActive ? 'true' : 'false'}"
          >
            ${escapeHtml(project.name)}
          </button>
        `;
      })
      .join('');
  };

  projectCards.addEventListener('click', async (event) => {
    const cardButton = event.target.closest('[data-project-id]');

    if (!cardButton) {
      return;
    }

    const nextProjectId = cardButton.getAttribute('data-project-id');

    if (!nextProjectId || nextProjectId === selectedProjectId) {
      return;
    }

    selectedProjectId = nextProjectId;
    renderProjectCards();
    setProjectLink(projectDetailsLink, selectedProjectId);
    await loadProjectData(selectedProjectId, boardColumnsElement, messageElement);
  });

  renderProjectCards();
  setProjectLink(projectDetailsLink, selectedProjectId);
  await loadProjectData(selectedProjectId, boardColumnsElement, messageElement);
  return page;
}
