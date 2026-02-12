import template from './project-details.html?raw';
import './project-details.css';
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

function plainTextToHtml(text) {
  return escapeHtml(text || '').replaceAll('\n', '<br>');
}

function htmlToPlainText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html || '';
  return temp.textContent || '';
}

function ensureEmptyStates(boardColumnsElement) {
  boardColumnsElement.querySelectorAll('.board-task-list').forEach((taskList) => {
    const cards = taskList.querySelectorAll('.board-task');
    const emptyState = taskList.querySelector('.board-empty');

    if (!cards.length && !emptyState) {
      const placeholder = document.createElement('div');
      placeholder.className = 'board-empty';
      placeholder.textContent = 'No tasks.';
      taskList.append(placeholder);
    }

    if (cards.length && emptyState) {
      emptyState.remove();
    }
  });
}

function createCardActionButton(label, action, icon, buttonClass = 'btn-outline-secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${buttonClass}`;
  button.setAttribute('data-action', action);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.textContent = icon;
  return button;
}

function createMoveButton(label, direction, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-outline-secondary';
  button.setAttribute('data-move', direction);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.textContent = icon;
  return button;
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

      const taskHeader = document.createElement('div');
      taskHeader.className = 'board-task-header';

      const title = document.createElement('h3');
      title.textContent = task.title;

      const taskActions = document.createElement('div');
      taskActions.className = 'board-task-actions';
      taskActions.append(
        createCardActionButton('Edit task', 'edit-task', '✎'),
        createCardActionButton('Delete task', 'delete-task', '🗑', 'btn-outline-danger')
      );

      taskHeader.append(title, taskActions);

      const description = document.createElement('div');
      description.className = 'board-task-description text-body-secondary';
      description.innerHTML = task.description_html || '';

      const status = document.createElement('small');
      status.className = task.done ? 'text-success' : 'text-body-secondary';
      status.textContent = task.done ? 'Done' : 'Open';

      const controls = document.createElement('div');
      controls.className = 'board-task-controls';
      controls.append(
        createMoveButton('Move task up', 'up', '↑'),
        createMoveButton('Move task down', 'down', '↓'),
        createMoveButton('Move task left', 'left', '←'),
        createMoveButton('Move task right', 'right', '→')
      );

      card.append(taskHeader, description, status, controls);
      taskList.append(card);
    });

    const columnFooter = document.createElement('div');
    columnFooter.className = 'board-column-footer';

    const addTaskButton = document.createElement('button');
    addTaskButton.type = 'button';
    addTaskButton.className = 'btn btn-outline-primary board-add-task';
    addTaskButton.setAttribute('data-action', 'add-task');
    addTaskButton.setAttribute('data-stage-id', stage.id);
    addTaskButton.setAttribute('aria-label', `Add task to ${stage.name}`);
    addTaskButton.setAttribute('title', `Add task to ${stage.name}`);
    addTaskButton.textContent = '+';

    columnFooter.append(addTaskButton);
    column.append(header, taskList);
    column.append(columnFooter);
    boardColumnsElement.append(column);
  });

  ensureEmptyStates(boardColumnsElement);
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
  let isSaving = false;

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

    if (isSaving) {
      dragStarted = false;
      return;
    }

    isSaving = true;
    ensureEmptyStates(boardColumnsElement);

    const result = await persistTaskOrder(boardColumnsElement, tasks, messageElement);

    if (!result.success) {
      onPersistError();
    }

    isSaving = false;
    dragStarted = false;
  });
}

function moveTaskCard(boardColumnsElement, cardElement, direction) {
  const currentList = cardElement.closest('.board-task-list');

  if (!currentList) {
    return false;
  }

  const listCards = [...currentList.querySelectorAll('.board-task')];
  const currentIndex = listCards.indexOf(cardElement);

  if (currentIndex < 0) {
    return false;
  }

  if (direction === 'up' && currentIndex > 0) {
    currentList.insertBefore(cardElement, listCards[currentIndex - 1]);
    return true;
  }

  if (direction === 'down' && currentIndex < listCards.length - 1) {
    const nextSibling = listCards[currentIndex + 1].nextSibling;
    currentList.insertBefore(cardElement, nextSibling);
    return true;
  }

  const stageLists = [...boardColumnsElement.querySelectorAll('.board-task-list')];
  const stageIndex = stageLists.indexOf(currentList);

  if (stageIndex < 0) {
    return false;
  }

  if (direction === 'left' && stageIndex > 0) {
    stageLists[stageIndex - 1].append(cardElement);
    return true;
  }

  if (direction === 'right' && stageIndex < stageLists.length - 1) {
    stageLists[stageIndex + 1].append(cardElement);
    return true;
  }

  return false;
}

function enableKeyboardReorder(boardColumnsElement, tasks, messageElement, onPersistError) {
  let isSaving = false;

  boardColumnsElement.addEventListener('click', async (event) => {
    const moveButton = event.target.closest('[data-move]');

    if (!moveButton || isSaving) {
      return;
    }

    const cardElement = moveButton.closest('.board-task');
    if (!cardElement) {
      return;
    }

    const direction = moveButton.getAttribute('data-move');
    const moved = moveTaskCard(boardColumnsElement, cardElement, direction);

    if (!moved) {
      return;
    }

    ensureEmptyStates(boardColumnsElement);
    isSaving = true;

    const result = await persistTaskOrder(boardColumnsElement, tasks, messageElement);

    if (!result.success) {
      onPersistError();
      isSaving = false;
      return;
    }

    isSaving = false;
    moveButton.focus();
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

function getNextTaskOrderPosition(tasks, stageId) {
  const stageTasks = tasks.filter((task) => task.stage_id === stageId);

  if (!stageTasks.length) {
    return 1;
  }

  const maxOrderPosition = stageTasks.reduce(
    (highest, task) => (task.order_position > highest ? task.order_position : highest),
    0
  );

  return maxOrderPosition + 1;
}

export async function renderProjectDetailsPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#projectMessage');
  const titleElement = page.querySelector('#projectTitle');
  const boardColumnsElement = page.querySelector('#projectBoardColumns');
  const taskModalElement = page.querySelector('#taskModal');
  const taskDeleteModalElement = page.querySelector('#taskDeleteModal');
  const taskModalLabelElement = page.querySelector('#taskModalLabel');
  const taskFormElement = page.querySelector('#taskForm');
  const taskTitleInput = page.querySelector('#taskTitle');
  const taskDescriptionInput = page.querySelector('#taskDescription');
  const taskDoneInput = page.querySelector('#taskDone');
  const taskFormSubmitButton = page.querySelector('#taskFormSubmit');
  const confirmTaskDeleteButton = page.querySelector('#confirmTaskDelete');
  const taskDeleteNameElement = page.querySelector('#taskDeleteName');
  const statsElements = {
    total: page.querySelector('#projectTasksTotal'),
    pending: page.querySelector('#projectTasksPending'),
    done: page.querySelector('#projectTasksDone'),
    stages: page.querySelector('#projectStagesCount')
  };

  const taskModal = new Modal(taskModalElement);
  const taskDeleteModal = new Modal(taskDeleteModalElement);

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
  let taskFormMode = 'add';
  let activeTaskId = '';
  let activeStageId = '';
  let pendingDeleteTaskId = '';

  const rerenderBoard = () => {
    setSummary(statsElements, stages.length, tasks);
    renderColumns(boardColumnsElement, stages, tasks);
  };

  const openAddTaskModal = (stageId) => {
    taskFormMode = 'add';
    activeTaskId = '';
    activeStageId = stageId;
    taskModalLabelElement.textContent = 'Add Task';
    taskFormSubmitButton.textContent = 'Create';
    taskFormElement.reset();
    taskDoneInput.checked = false;
    taskModal.show();
    taskTitleInput.focus();
  };

  const openEditTaskModal = (task) => {
    taskFormMode = 'edit';
    activeTaskId = task.id;
    activeStageId = task.stage_id;
    taskModalLabelElement.textContent = 'Edit Task';
    taskFormSubmitButton.textContent = 'Update';
    taskTitleInput.value = task.title || '';
    taskDescriptionInput.value = htmlToPlainText(task.description_html || '');
    taskDoneInput.checked = Boolean(task.done);
    taskModal.show();
    taskTitleInput.focus();
  };

  boardColumnsElement.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');

    if (!actionElement) {
      return;
    }

    const action = actionElement.getAttribute('data-action');

    if (action === 'add-task') {
      openAddTaskModal(actionElement.getAttribute('data-stage-id'));
      return;
    }

    if (action === 'edit-task') {
      const cardElement = actionElement.closest('.board-task');
      const taskId = cardElement?.getAttribute('data-task-id');
      const task = tasks.find((item) => item.id === taskId);

      if (!task) {
        return;
      }

      openEditTaskModal(task);
      return;
    }

    if (action === 'delete-task') {
      const cardElement = actionElement.closest('.board-task');
      const taskId = cardElement?.getAttribute('data-task-id');
      const task = tasks.find((item) => item.id === taskId);

      if (!task) {
        return;
      }

      pendingDeleteTaskId = task.id;
      taskDeleteNameElement.textContent = task.title || 'this task';
      taskDeleteModal.show();
    }
  });

  taskFormElement.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = taskTitleInput.value.trim();
    const descriptionHtml = plainTextToHtml(taskDescriptionInput.value.trim());
    const done = Boolean(taskDoneInput.checked);

    if (!title) {
      showMessage(messageElement, 'Task title is required.', 'warning');
      return;
    }

    taskFormSubmitButton.disabled = true;

    if (taskFormMode === 'add') {
      showMessage(messageElement, 'Creating task...', 'secondary');

      const orderPosition = getNextTaskOrderPosition(tasks, activeStageId);
      const { data: insertedTask, error } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          stage_id: activeStageId,
          title,
          description_html: descriptionHtml,
          done,
          order_position: orderPosition
        })
        .select('id, stage_id, title, description_html, order_position, done')
        .single();

      taskFormSubmitButton.disabled = false;

      if (error) {
        showMessage(messageElement, error.message || 'Failed to create task.', 'danger');
        return;
      }

      tasks.push(insertedTask);
      taskModal.hide();
      rerenderBoard();
      showMessage(messageElement, 'Task created.', 'success');
      return;
    }

    showMessage(messageElement, 'Updating task...', 'secondary');

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update({
        title,
        description_html: descriptionHtml,
        done
      })
      .eq('id', activeTaskId)
      .select('id, stage_id, title, description_html, order_position, done')
      .single();

    taskFormSubmitButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message || 'Failed to update task.', 'danger');
      return;
    }

    const existingTask = tasks.find((item) => item.id === activeTaskId);
    if (existingTask) {
      existingTask.title = updatedTask.title;
      existingTask.description_html = updatedTask.description_html;
      existingTask.done = updatedTask.done;
    }

    taskModal.hide();
    rerenderBoard();
    showMessage(messageElement, 'Task updated.', 'success');
  });

  confirmTaskDeleteButton.addEventListener('click', async () => {
    if (!pendingDeleteTaskId) {
      return;
    }

    confirmTaskDeleteButton.disabled = true;
    showMessage(messageElement, 'Deleting task...', 'secondary');

    const { error } = await supabase.from('tasks').delete().eq('id', pendingDeleteTaskId);

    confirmTaskDeleteButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message || 'Failed to delete task.', 'danger');
      return;
    }

    const taskIndex = tasks.findIndex((item) => item.id === pendingDeleteTaskId);
    if (taskIndex >= 0) {
      tasks.splice(taskIndex, 1);
    }

    pendingDeleteTaskId = '';
    taskDeleteModal.hide();
    rerenderBoard();
    showMessage(messageElement, 'Task deleted.', 'success');
  });

  rerenderBoard();
  enableDragAndDrop(boardColumnsElement, tasks, messageElement, () => {
    rerenderBoard();
  });
  enableKeyboardReorder(boardColumnsElement, tasks, messageElement, () => {
    rerenderBoard();
  });
  showMessage(messageElement, '');

  return page;
}
