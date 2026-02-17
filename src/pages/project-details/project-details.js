import template from './project-details.html?raw';
import './project-details.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../lib/supabase-client.js';

const TASK_ATTACHMENTS_BUCKET = 'task-attachments';

function showMessage(messageElement, message, variant = 'secondary') {
  if (!message) {
    messageElement.className = 'alert d-none';
    messageElement.textContent = '';
    return;
  }

  messageElement.className = `alert alert-${variant}`;
  messageElement.textContent = message;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'file').replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const sizeIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** sizeIndex;
  return `${value.toFixed(sizeIndex === 0 ? 0 : 1)} ${units[sizeIndex]}`;
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

function clearFieldError(inputElement, feedbackElement) {
  inputElement.classList.remove('is-invalid');
  feedbackElement.textContent = '';
}

function setFieldError(inputElement, feedbackElement, message) {
  inputElement.classList.add('is-invalid');
  feedbackElement.textContent = message;
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

function createCardActionButton(label, action, iconClass, buttonClass = 'btn-outline-secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm board-task-action ${buttonClass}`;
  button.setAttribute('data-action', action);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  const icon = document.createElement('i');
  icon.className = iconClass;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  return button;
}

function createStageActionButton(label, action, buttonClass = 'btn-outline-secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${buttonClass}`;
  button.setAttribute('data-action', action);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.textContent = label;
  return button;
}

function renderColumns(boardColumnsElement, stages, tasks, attachmentsByTaskId) {
  boardColumnsElement.innerHTML = '';

  stages.forEach((stage) => {
    const column = document.createElement('section');
    column.className = 'board-column';

    const header = document.createElement('div');
    header.className = 'board-column-header';

    const headerTitle = document.createElement('span');
    headerTitle.textContent = stage.name;

    const addTaskButton = document.createElement('button');
    addTaskButton.type = 'button';
    addTaskButton.className = 'btn btn-outline-primary board-add-task';
    addTaskButton.setAttribute('data-action', 'add-task');
    addTaskButton.setAttribute('data-stage-id', stage.id);
    addTaskButton.setAttribute('data-tooltip', 'Create new task');
    addTaskButton.setAttribute('aria-label', `Create new task in ${stage.name}`);
    addTaskButton.setAttribute('title', `Create new task in ${stage.name}`);
    addTaskButton.textContent = '+';

    header.append(headerTitle, addTaskButton);

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
        createCardActionButton('Edit task', 'edit-task', 'bi bi-pencil'),
        createCardActionButton('Delete task', 'delete-task', 'bi bi-trash', 'btn-outline-danger')
      );

      taskHeader.append(title, taskActions);

      const description = document.createElement('div');
      description.className = 'board-task-description text-body-secondary';
      description.innerHTML = task.description_html || '';

      const status = document.createElement('small');
      status.className = task.done ? 'text-success' : 'text-body-secondary';
      status.textContent = task.done ? 'Done' : 'Open';

      const taskFiles = document.createElement('div');
      taskFiles.className = 'board-task-files';

      const taskAttachments = attachmentsByTaskId.get(task.id) || [];
      if (taskAttachments.length) {
        const filesLabel = document.createElement('small');
        filesLabel.className = 'text-body-secondary';
        filesLabel.textContent = `Files (${taskAttachments.length})`;
        taskFiles.append(filesLabel);

        taskAttachments.slice(0, 3).forEach((attachment) => {
          const fileLink = document.createElement('a');
          fileLink.className = 'board-task-file-link';
          fileLink.href = attachment.signed_url;
          fileLink.target = '_blank';
          fileLink.rel = 'noopener noreferrer';
          fileLink.textContent = attachment.file_name;
          taskFiles.append(fileLink);
        });
      }

      const currentStageName = (stage.name || '').trim().toLowerCase();
      const isInProgressState = currentStageName === 'in progress' && !task.done;
      const isDoneState = currentStageName === 'done' && task.done;

      const stageActions = document.createElement('div');
      stageActions.className = 'board-task-stage-actions';
      const inProgressButton = createStageActionButton('In Progress', 'mark-in-progress', 'btn-outline-secondary');
      const doneButton = createStageActionButton('Done', 'mark-done', 'btn-outline-success');

      inProgressButton.disabled = isInProgressState;
      doneButton.disabled = isDoneState;

      if (isInProgressState) {
        inProgressButton.classList.remove('btn-outline-secondary');
        inProgressButton.classList.add('btn-secondary');
      }

      if (isDoneState) {
        doneButton.classList.remove('btn-outline-success');
        doneButton.classList.add('btn-success');
      }

      stageActions.append(
        inProgressButton,
        doneButton
      );

      card.append(taskHeader, description, status, taskFiles, stageActions);
      taskList.append(card);
    });

    column.append(header, taskList);
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

  const temporaryBase = 2000000000;
  const temporaryUpdates = updates.map((updateItem, index) => ({
    id: updateItem.id,
    stage_id: updateItem.stage_id,
    order_position: temporaryBase - index
  }));

  const temporaryResults = await Promise.all(
    temporaryUpdates.map((updateItem) =>
      supabase
        .from('tasks')
        .update({
          stage_id: updateItem.stage_id,
          order_position: updateItem.order_position
        })
        .eq('id', updateItem.id)
    )
  );

  const temporaryFailure = temporaryResults.find((result) => result.error);
  if (temporaryFailure?.error) {
    showMessage(messageElement, temporaryFailure.error.message || 'Failed to save task positions.', 'danger');
    return { success: false };
  }

  const finalResults = await Promise.all(
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

  const finalFailure = finalResults.find((result) => result.error);
  if (finalFailure?.error) {
    showMessage(messageElement, finalFailure.error.message || 'Failed to save task positions.', 'danger');
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

async function ensureProjectStages(projectId, stages, messageElement) {
  if (stages.length) {
    return stages;
  }

  showMessage(messageElement, 'Creating default stages...', 'secondary');

  const defaultStages = [
    { project_id: projectId, name: 'Not Started', order_position: 1 },
    { project_id: projectId, name: 'In Progress', order_position: 2 },
    { project_id: projectId, name: 'Done', order_position: 3 }
  ];

  const { error: createError } = await supabase.from('project_stages').insert(defaultStages);
  if (createError) {
    showMessage(messageElement, createError.message || 'Failed to create default stages.', 'danger');
    return [];
  }

  const { data: refreshedStages, error: reloadError } = await supabase
    .from('project_stages')
    .select('id, name, order_position')
    .eq('project_id', projectId)
    .order('order_position', { ascending: true });

  if (reloadError) {
    showMessage(messageElement, reloadError.message || 'Failed to reload stages.', 'danger');
    return [];
  }

  return refreshedStages || [];
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
  const taskTitleFeedback = page.querySelector('#taskTitleFeedback');
  const taskDescriptionFeedback = page.querySelector('#taskDescriptionFeedback');
  const taskAttachmentsInput = page.querySelector('#taskAttachmentsInput');
  const taskAttachmentsList = page.querySelector('#taskAttachmentsList');
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

  const stages = await ensureProjectStages(projectId, stagesResult.data || [], messageElement);
  const tasks = tasksResult.data || [];
  let attachmentsByTaskId = new Map();
  let taskFormMode = 'add';
  let activeTaskId = '';
  let activeStageId = '';
  let pendingDeleteTaskId = '';
  let activeTaskAttachments = [];
  let realtimeRefreshTimer = null;

  const clearTaskFormValidation = () => {
    clearFieldError(taskTitleInput, taskTitleFeedback);
    clearFieldError(taskDescriptionInput, taskDescriptionFeedback);
  };

  const renderTaskAttachmentsList = () => {
    if (!activeTaskAttachments.length) {
      taskAttachmentsList.innerHTML = '<small class="text-body-secondary">No attachments yet.</small>';
      return;
    }

    taskAttachmentsList.innerHTML = activeTaskAttachments
      .map(
        (attachment) => `
          <div class="task-attachment-item">
            <div>
              <a href="${attachment.signed_url}" target="_blank" rel="noopener noreferrer" class="task-attachment-name">${escapeHtml(attachment.file_name || 'Attachment')}</a>
              <div><small class="text-body-secondary">${formatFileSize(attachment.file_size)}</small></div>
            </div>
            <div class="task-attachment-actions">
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="remove-attachment"
                data-attachment-id="${attachment.id}"
                data-attachment-path="${escapeHtml(attachment.file_path)}"
              >
                Remove
              </button>
            </div>
          </div>
        `
      )
      .join('');
  };

  const loadTaskAttachments = async (taskId) => {
    const { data: rows, error } = await supabase
      .from('task_attachments')
      .select('id, file_name, file_path, file_size')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      showMessage(messageElement, error.message || 'Failed to load attachments.', 'danger');
      activeTaskAttachments = [];
      renderTaskAttachmentsList();
      return;
    }

    const attachments = rows || [];
    const signedUrlResults = await Promise.all(
      attachments.map((attachment) =>
        supabase.storage.from(TASK_ATTACHMENTS_BUCKET).createSignedUrl(attachment.file_path, 3600)
      )
    );

    activeTaskAttachments = attachments
      .map((attachment, index) => ({
        ...attachment,
        signed_url: signedUrlResults[index]?.data?.signedUrl || '#'
      }))
      .filter((attachment) => attachment.signed_url && attachment.signed_url !== '#');

    renderTaskAttachmentsList();
  };

  const uploadSelectedAttachments = async (taskId) => {
    const selectedFiles = [...(taskAttachmentsInput.files || [])];

    if (!selectedFiles.length) {
      return { success: true };
    }

    for (const file of selectedFiles) {
      const safeName = sanitizeFileName(file.name);
      const filePath = `${taskId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream'
        });

      if (uploadError) {
        showMessage(messageElement, uploadError.message || 'Failed to upload attachment.', 'danger');
        return { success: false };
      }

      const { error: insertError } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
        created_by: session.user.id
      });

      if (insertError) {
        showMessage(messageElement, insertError.message || 'Failed to save attachment metadata.', 'danger');
        return { success: false };
      }
    }

    taskAttachmentsInput.value = '';
    return { success: true };
  };

  const rerenderBoard = () => {
    setSummary(statsElements, stages.length, tasks);
    renderColumns(boardColumnsElement, stages, tasks, attachmentsByTaskId);
  };

  const refreshAttachmentsForCurrentTasks = async () => {
    const taskIds = tasks.map((task) => task.id);

    if (!taskIds.length) {
      attachmentsByTaskId = new Map();
      rerenderBoard();
      return;
    }

    const { data: rows, error } = await supabase
      .from('task_attachments')
      .select('id, task_id, file_name, file_path')
      .in('task_id', taskIds)
      .order('created_at', { ascending: true });

    if (error) {
      showMessage(messageElement, error.message || 'Failed to refresh attachments.', 'danger');
      return;
    }

    const rawAttachments = rows || [];
    const signedUrlResults = await Promise.all(
      rawAttachments.map((attachment) =>
        supabase.storage.from(TASK_ATTACHMENTS_BUCKET).createSignedUrl(attachment.file_path, 3600)
      )
    );

    const mappedAttachments = new Map();

    rawAttachments.forEach((attachment, index) => {
      const signedUrl = signedUrlResults[index]?.data?.signedUrl;
      if (!signedUrl) {
        return;
      }

      if (!mappedAttachments.has(attachment.task_id)) {
        mappedAttachments.set(attachment.task_id, []);
      }

      mappedAttachments.get(attachment.task_id).push({
        id: attachment.id,
        file_name: attachment.file_name,
        file_path: attachment.file_path,
        signed_url: signedUrl
      });
    });

    attachmentsByTaskId = mappedAttachments;
    rerenderBoard();
  };

  const refreshTasksFromDatabase = async () => {
    const { data: latestTasks, error } = await supabase
      .from('tasks')
      .select('id, stage_id, title, description_html, order_position, done')
      .eq('project_id', projectId);

    if (error) {
      showMessage(messageElement, error.message || 'Failed to refresh tasks.', 'danger');
      return;
    }

    tasks.length = 0;
    tasks.push(...(latestTasks || []));
    await refreshAttachmentsForCurrentTasks();
  };

  const openAddTaskModal = (stageId) => {
    taskFormMode = 'add';
    activeTaskId = '';
    activeStageId = stageId;
    activeTaskAttachments = [];
    taskModalLabelElement.textContent = 'Add Task';
    taskFormSubmitButton.textContent = 'Create';
    taskFormElement.reset();
    clearTaskFormValidation();
    taskDoneInput.checked = false;
    taskAttachmentsInput.value = '';
    renderTaskAttachmentsList();
    taskModal.show();
    taskTitleInput.focus();
  };

  const openEditTaskModal = async (task) => {
    taskFormMode = 'edit';
    activeTaskId = task.id;
    activeStageId = task.stage_id;
    taskModalLabelElement.textContent = 'Edit Task';
    taskFormSubmitButton.textContent = 'Update';
    clearTaskFormValidation();
    taskTitleInput.value = task.title || '';
    taskDescriptionInput.value = htmlToPlainText(task.description_html || '');
    taskDoneInput.checked = Boolean(task.done);
    taskAttachmentsInput.value = '';
    activeTaskAttachments = [];
    renderTaskAttachmentsList();
    taskModal.show();
    taskTitleInput.focus();
    await loadTaskAttachments(task.id);
  };

  renderTaskAttachmentsList();

  boardColumnsElement.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');

    if (!actionElement) {
      const taskCard = event.target.closest('.board-task');

      if (!taskCard) {
        return;
      }

      if (event.target.closest('a, button, input, textarea, select, label')) {
        return;
      }

      const taskId = taskCard.getAttribute('data-task-id');
      const task = tasks.find((item) => item.id === taskId);

      if (!task) {
        return;
      }

      openEditTaskModal(task);
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
      return;
    }

    if (action === 'mark-in-progress' || action === 'mark-done') {
      (async () => {
        const cardElement = actionElement.closest('.board-task');
        const taskId = cardElement?.getAttribute('data-task-id');
        const task = tasks.find((item) => item.id === taskId);

        if (!task) {
          return;
        }

        const targetStageName = action === 'mark-done' ? 'done' : 'in progress';
        const targetDoneState = action === 'mark-done';
        const targetStage = stages.find((stage) => stage.name.trim().toLowerCase() === targetStageName);

        if (!targetStage) {
          showMessage(messageElement, `Stage "${targetStageName}" was not found for this project.`, 'warning');
          return;
        }

        const targetOrderPosition = getNextTaskOrderPosition(tasks, targetStage.id);

        showMessage(messageElement, 'Updating task...', 'secondary');
        const { data: updatedTask, error } = await supabase
          .from('tasks')
          .update({
            stage_id: targetStage.id,
            order_position: targetOrderPosition,
            done: targetDoneState
          })
          .eq('id', task.id)
          .select('id, stage_id, order_position, done')
          .single();

        if (error) {
          showMessage(messageElement, error.message || 'Failed to update task.', 'danger');
          return;
        }

        task.stage_id = updatedTask.stage_id;
        task.order_position = updatedTask.order_position;
        task.done = updatedTask.done;

        rerenderBoard();
        showMessage(messageElement, '');
      })();
    }

  });

  taskAttachmentsList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-action="remove-attachment"]');
    if (!removeButton) {
      return;
    }

    (async () => {
      const attachmentId = removeButton.getAttribute('data-attachment-id');
      const attachmentPath = removeButton.getAttribute('data-attachment-path');

      if (!attachmentId || !attachmentPath) {
        return;
      }

      removeButton.disabled = true;
      showMessage(messageElement, 'Removing attachment...', 'secondary');

      const { error: storageError } = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([attachmentPath]);
      if (storageError) {
        showMessage(messageElement, storageError.message || 'Failed to remove attachment file.', 'danger');
        removeButton.disabled = false;
        return;
      }

      const { error: rowError } = await supabase.from('task_attachments').delete().eq('id', attachmentId);
      if (rowError) {
        showMessage(messageElement, rowError.message || 'Failed to remove attachment metadata.', 'danger');
        removeButton.disabled = false;
        return;
      }

      activeTaskAttachments = activeTaskAttachments.filter((attachment) => attachment.id !== attachmentId);
      attachmentsByTaskId.set(
        activeTaskId,
        activeTaskAttachments.map((attachment) => ({
          id: attachment.id,
          file_name: attachment.file_name,
          file_path: attachment.file_path,
          signed_url: attachment.signed_url
        }))
      );
      renderTaskAttachmentsList();
      rerenderBoard();
      showMessage(messageElement, 'Attachment removed.', 'success');
    })();
  });

  taskTitleInput.addEventListener('input', () => {
    if (taskTitleInput.classList.contains('is-invalid') && taskTitleInput.value.trim()) {
      clearFieldError(taskTitleInput, taskTitleFeedback);
    }
  });

  taskDescriptionInput.addEventListener('input', () => {
    if (taskDescriptionInput.classList.contains('is-invalid')) {
      clearFieldError(taskDescriptionInput, taskDescriptionFeedback);
    }
  });

  taskModalElement.addEventListener('hidden.bs.modal', () => {
    clearTaskFormValidation();
  });

  taskFormElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTaskFormValidation();

    const title = taskTitleInput.value.trim();
    const descriptionHtml = plainTextToHtml(taskDescriptionInput.value.trim());
    const done = Boolean(taskDoneInput.checked);

    if (!title) {
      setFieldError(taskTitleInput, taskTitleFeedback, 'Title is required.');
      taskTitleInput.focus();
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

      const uploadResult = await uploadSelectedAttachments(insertedTask.id);
      if (!uploadResult.success) {
        taskFormSubmitButton.disabled = false;
        return;
      }

      tasks.push(insertedTask);
      await refreshAttachmentsForCurrentTasks();
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

    const uploadResult = await uploadSelectedAttachments(activeTaskId);
    if (!uploadResult.success) {
      taskFormSubmitButton.disabled = false;
      return;
    }

    const existingTask = tasks.find((item) => item.id === activeTaskId);
    if (existingTask) {
      existingTask.title = updatedTask.title;
      existingTask.description_html = updatedTask.description_html;
      existingTask.done = updatedTask.done;
    }

    await refreshAttachmentsForCurrentTasks();
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
      attachmentsByTaskId.delete(tasks[taskIndex].id);
      tasks.splice(taskIndex, 1);
    }

    pendingDeleteTaskId = '';
    taskDeleteModal.hide();
    rerenderBoard();
    showMessage(messageElement, 'Task deleted.', 'success');
  });

  const realtimeChannel = supabase
    .channel(`project-tasks-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`
      },
      () => {
        if (realtimeRefreshTimer) {
          return;
        }

        realtimeRefreshTimer = window.setTimeout(async () => {
          realtimeRefreshTimer = null;
          await refreshTasksFromDatabase();
        }, 120);
      }
    )
    .subscribe();

  const cleanupRealtime = () => {
    if (realtimeRefreshTimer) {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
    }

    supabase.removeChannel(realtimeChannel);
  };

  window.addEventListener('beforeunload', cleanupRealtime, { once: true });

  rerenderBoard();
  await refreshAttachmentsForCurrentTasks();
  enableDragAndDrop(boardColumnsElement, tasks, messageElement, () => {
    rerenderBoard();
  });
  showMessage(messageElement, '');

  return page;
}
