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
    taskList.setAttribute('data-stage-id', stage.id);

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
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-task-id', task.id);

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

function getDragAfterElement(taskListElement, cursorY) {
  const draggableCards = [...taskListElement.querySelectorAll('.board-task:not(.dragging)')];

  return draggableCards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = cursorY - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function buildTaskUpdatesFromDom(boardColumnsElement, currentTasks) {
  const updates = [];
  const tasksById = new Map(currentTasks.map((task) => [task.id, task]));

  boardColumnsElement.querySelectorAll('.board-task-list').forEach((taskList) => {
    const stageId = taskList.getAttribute('data-stage-id');
    const cards = [...taskList.querySelectorAll('.board-task')];

    cards.forEach((card, index) => {
      const taskId = card.getAttribute('data-task-id');
      const sourceTask = tasksById.get(taskId);

      if (!sourceTask) {
        return;
      }

      const newPosition = index + 1;
      if (sourceTask.stage_id !== stageId || sourceTask.order_position !== newPosition) {
        updates.push({
          id: taskId,
          stage_id: stageId,
          order_position: newPosition
        });
      }
    });
  });

  return updates;
}

async function persistTaskOrder(boardColumnsElement, tasks, messageElement) {
  const updates = buildTaskUpdatesFromDom(boardColumnsElement, tasks);

  if (!updates.length) {
    return { success: true };
  }

  showMessage(messageElement, 'Saving task positions...', 'secondary');

  const updateResults = await Promise.all(
    updates.map((updateItem) =>
      supabase
        .from('tasks')
        .update({
          stage_id: updateItem.stage_id,
          order_position: updateItem.order_position
        })
        .eq('id', updateItem.id)
    )
  );

  const failedUpdate = updateResults.find((result) => result.error);
  if (failedUpdate?.error) {
    showMessage(messageElement, failedUpdate.error.message || 'Failed to save task positions.', 'danger');
    return { success: false };
  }

  updates.forEach((updateItem) => {
    const task = tasks.find((currentTask) => currentTask.id === updateItem.id);
    if (!task) {
      return;
    }

    task.stage_id = updateItem.stage_id;
    task.order_position = updateItem.order_position;
  });

  showMessage(messageElement, '');
  return { success: true };
}

function enableDragAndDrop(boardColumnsElement, tasks, messageElement, onPersistError) {
  let dragStarted = false;

  boardColumnsElement.addEventListener('dragstart', (event) => {
    const cardElement = event.target.closest('.board-task');

    if (!cardElement) {
      return;
    }

    dragStarted = true;
    cardElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardElement.getAttribute('data-task-id') || '');
  });

  boardColumnsElement.addEventListener('dragover', (event) => {
    const taskList = event.target.closest('.board-task-list');

    if (!taskList) {
      return;
    }

    event.preventDefault();
    const draggingElement = boardColumnsElement.querySelector('.board-task.dragging');

    if (!draggingElement) {
      return;
    }

    const afterElement = getDragAfterElement(taskList, event.clientY);

    if (!afterElement) {
      taskList.append(draggingElement);
    } else {
      taskList.insertBefore(draggingElement, afterElement);
    }
  });

  boardColumnsElement.addEventListener('drop', (event) => {
    const taskList = event.target.closest('.board-task-list');
    if (!taskList) {
      return;
    }

    event.preventDefault();
  });

  boardColumnsElement.addEventListener('dragend', async (event) => {
    const cardElement = event.target.closest('.board-task');
    if (!cardElement) {
      return;
    }

    cardElement.classList.remove('dragging');

    if (!dragStarted) {
      return;
    }

    const result = await persistTaskOrder(boardColumnsElement, tasks, messageElement);

    if (!result.success) {
      onPersistError();
    }

    dragStarted = false;
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

function resolveProjectIdFromLocation() {
  const pathMatch = window.location.pathname.match(/^\/project\/([^/]+)\/tasks\/?$/);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('id');
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

  const projectId = resolveProjectIdFromLocation();

  if (!projectId) {
    showMessage(messageElement, 'Missing project id. Open this page from Projects.', 'warning');
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
  enableDragAndDrop(boardColumnsElement, tasks, messageElement, () => {
    renderColumns(boardColumnsElement, stages, tasks);
  });
  showMessage(messageElement, '');

  return page;
}
