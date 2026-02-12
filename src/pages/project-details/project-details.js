import template from './project-details.html?raw';
import './project-details.css';
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

function setSummary(statsElements, stagesCount, tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const pending = total - done;

  statsElements.total.textContent = String(total);
  statsElements.pending.textContent = String(pending);
  statsElements.done.textContent = String(done);
  statsElements.stages.textContent = String(stagesCount);
}

export async function renderProjectDetailsPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#projectMessage');
  const titleElement = page.querySelector('#projectTitle');
  const boardColumnsElement = page.querySelector('#projectBoardColumns');
  const statsElements = {
    total: page.querySelector('#projectTasksTotal'),
    pending: page.querySelector('#projectTasksPending'),
    done: page.querySelector('#projectTasksDone'),
    stages: page.querySelector('#projectStagesCount')
  };

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login/';
    return page;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const projectId = searchParams.get('id');

  if (!projectId) {
    showMessage(messageElement, 'Missing project id. Open this page from dashboard.', 'warning');
    boardColumnsElement.innerHTML = '';
    return page;
  }

  showMessage(messageElement, 'Loading project...', 'secondary');

  const [projectResult, stagesResult, tasksResult] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).single(),
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

  if (projectResult.error || stagesResult.error || tasksResult.error) {
    showMessage(
      messageElement,
      projectResult.error?.message || stagesResult.error?.message || tasksResult.error?.message || 'Failed to load project.',
      'danger'
    );
    boardColumnsElement.innerHTML = '';
    return page;
  }

  titleElement.textContent = projectResult.data?.name || 'Project';

  const stages = stagesResult.data || [];
  const tasks = tasksResult.data || [];

  setSummary(statsElements, stages.length, tasks);
  renderColumns(boardColumnsElement, stages, tasks);
  showMessage(messageElement, '');

  return page;
}
