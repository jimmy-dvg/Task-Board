import template from './project-details.html?raw';
import './project-details.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../lib/supabase-client.js';
import { createTaskEditorController } from '../../components/task-editor/task-editor.js';

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

function normalizeLabelName(value) {
  return String(value || '').trim().toLowerCase();
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDeadlineDate(deadlineDate) {
  const text = String(deadlineDate || '').trim();

  if (!text) {
    return '';
  }

  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleDateString();
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

function isImageAttachment(attachment) {
  const mimeType = String(attachment?.mime_type || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  const fileName = String(attachment?.file_name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg|ico|avif)$/i.test(fileName);
}

function renderColumns(boardColumnsElement, stages, tasks, attachmentsByTaskId, labelsByTaskId) {
  boardColumnsElement.innerHTML = '';
  const todayIsoDate = getTodayIsoDate();

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

      const taskAttachments = attachmentsByTaskId.get(task.id) || [];
      const coverImage = taskAttachments.find((attachment) => isImageAttachment(attachment));

      if (coverImage?.signed_url) {
        const coverImageElement = document.createElement('img');
        coverImageElement.className = 'board-task-cover';
        coverImageElement.src = coverImage.signed_url;
        coverImageElement.alt = task.title || 'Task cover';
        card.append(coverImageElement);
      }

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

      const deadlineMeta = document.createElement('small');
      deadlineMeta.className = 'text-body-secondary';

      if (task.deadline_date) {
        const isOverdue = !task.done && String(task.deadline_date) < todayIsoDate;
        deadlineMeta.className = isOverdue ? 'text-danger fw-semibold' : 'text-body-secondary';
        deadlineMeta.textContent = `Due ${formatDeadlineDate(task.deadline_date)}`;
      } else {
        deadlineMeta.textContent = 'No deadline';
      }

      const taskLabels = labelsByTaskId.get(task.id) || [];
      const labelsWrap = document.createElement('div');
      labelsWrap.className = 'board-task-labels';

      taskLabels.forEach((label) => {
        const labelBadge = document.createElement('span');
        labelBadge.className = 'badge text-bg-light board-task-label';
        labelBadge.textContent = label.name;
        labelsWrap.append(labelBadge);
      });

      const taskFiles = document.createElement('div');
      taskFiles.className = 'board-task-files';

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

      card.append(taskHeader, description, status, deadlineMeta, labelsWrap, taskFiles, stageActions);
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

function enableDragAndDrop(boardColumnsElement, tasks, messageElement, onPersistError, canDragTasks = () => true) {
  let dragStarted = false;
  let isSaving = false;

  boardColumnsElement.addEventListener('dragstart', (event) => {
    const cardElement = event.target.closest('.board-task');

    if (!cardElement) {
      return;
    }

    if (!canDragTasks()) {
      event.preventDefault();
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
  const activityLinkElement = page.querySelector('#projectActivityLink');
  const deadlinesLinkElement = page.querySelector('#projectDeadlinesLink');
  const labelsLinkElement = page.querySelector('#projectLabelsLink');
  const boardLabelFilterElement = page.querySelector('#boardLabelFilter');
  const boardLabelFilterClearElement = page.querySelector('#boardLabelFilterClear');
  const boardColumnsElement = page.querySelector('#projectBoardColumns');
  const taskDeleteModalElement = page.querySelector('#taskDeleteModal');
  const confirmTaskDeleteButton = page.querySelector('#confirmTaskDelete');
  const taskDeleteNameElement = page.querySelector('#taskDeleteName');
  const statsElements = {
    total: page.querySelector('#projectTasksTotal'),
    pending: page.querySelector('#projectTasksPending'),
    done: page.querySelector('#projectTasksDone'),
    stages: page.querySelector('#projectStagesCount')
  };

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

  activityLinkElement.href = `/project/${projectId}/activity`;
  deadlinesLinkElement.href = `/project/${projectId}/deadlines`;
  labelsLinkElement.href = `/project/${projectId}/labels`;

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
      .select('id, stage_id, title, description_html, order_position, done, deadline_date')
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
  let labelsByTaskId = new Map();
  let pendingDeleteTaskId = '';
  let realtimeRefreshTimer = null;
  let commentsRealtimeRefreshTimer = null;
  let labelsRealtimeRefreshTimer = null;
  let activeLabelFilterId = '';

  const syncTaskLabelNamesOnTasks = () => {
    tasks.forEach((task) => {
      task.labelNames = (labelsByTaskId.get(task.id) || []).map((label) => label.name);
    });
  };

  const getAvailableBoardLabels = () => {
    const labelMap = new Map();

    labelsByTaskId.forEach((taskLabels) => {
      taskLabels.forEach((label) => {
        if (!label?.id || !label?.name) {
          return;
        }

        if (!labelMap.has(label.id)) {
          labelMap.set(label.id, { id: label.id, name: label.name });
        }
      });
    });

    return [...labelMap.values()].sort((firstLabel, secondLabel) =>
      firstLabel.name.localeCompare(secondLabel.name, undefined, { sensitivity: 'base' })
    );
  };

  const getFilteredTasks = () => {
    if (!activeLabelFilterId) {
      return tasks;
    }

    return tasks.filter((task) => {
      const taskLabels = labelsByTaskId.get(task.id) || [];
      return taskLabels.some((label) => label.id === activeLabelFilterId);
    });
  };

  const renderBoardLabelFilter = () => {
    const availableLabels = getAvailableBoardLabels();
    const hasActiveFilter = Boolean(activeLabelFilterId);
    const selectedFilterExists = availableLabels.some((label) => label.id === activeLabelFilterId);

    if (hasActiveFilter && !selectedFilterExists) {
      activeLabelFilterId = '';
    }

    boardLabelFilterElement.innerHTML = [
      '<option value="">All labels</option>',
      ...availableLabels.map((label) => `<option value="${label.id}">${escapeHtml(label.name)}</option>`)
    ].join('');

    boardLabelFilterElement.value = activeLabelFilterId;
    boardLabelFilterClearElement.classList.toggle('d-none', !activeLabelFilterId);
    boardLabelFilterElement.disabled = availableLabels.length === 0;
  };

  const rerenderBoard = () => {
    setSummary(statsElements, stages.length, tasks);
    renderBoardLabelFilter();
    renderColumns(boardColumnsElement, stages, getFilteredTasks(), attachmentsByTaskId, labelsByTaskId);
  };

  const refreshTaskLabelsForCurrentTasks = async () => {
    const taskIds = tasks.map((task) => task.id);

    if (!taskIds.length) {
      labelsByTaskId = new Map();
      syncTaskLabelNamesOnTasks();
      rerenderBoard();
      return;
    }

    const { data: taskLabelRows, error: taskLabelsError } = await supabase
      .from('task_labels')
      .select('task_id, label_id')
      .in('task_id', taskIds);

    if (taskLabelsError) {
      showMessage(messageElement, taskLabelsError.message || 'Failed to refresh labels.', 'danger');
      return;
    }

    const labelIds = [...new Set((taskLabelRows || []).map((row) => row.label_id).filter(Boolean))];
    const labelsById = new Map();

    if (labelIds.length) {
      const { data: labelRows, error: labelsError } = await supabase
        .from('project_labels')
        .select('id, name')
        .eq('project_id', projectId)
        .in('id', labelIds);

      if (labelsError) {
        showMessage(messageElement, labelsError.message || 'Failed to refresh labels.', 'danger');
        return;
      }

      (labelRows || []).forEach((label) => {
        labelsById.set(label.id, label);
      });
    }

    const mappedLabels = new Map();

    (taskLabelRows || []).forEach((row) => {
      const label = labelsById.get(row.label_id);
      if (!label) {
        return;
      }

      if (!mappedLabels.has(row.task_id)) {
        mappedLabels.set(row.task_id, []);
      }

      mappedLabels.get(row.task_id).push({
        id: label.id,
        name: label.name
      });
    });

    mappedLabels.forEach((taskLabels) => {
      taskLabels.sort((firstLabel, secondLabel) =>
        firstLabel.name.localeCompare(secondLabel.name, undefined, { sensitivity: 'base' })
      );
    });

    labelsByTaskId = mappedLabels;
    syncTaskLabelNamesOnTasks();
    rerenderBoard();
  };

  const syncTaskLabels = async (taskId, labelNames) => {
    const normalizedEntries = [];
    const seen = new Set();

    (labelNames || []).forEach((labelName) => {
      const trimmedName = String(labelName || '').trim();
      const normalizedName = normalizeLabelName(trimmedName);

      if (!normalizedName || seen.has(normalizedName)) {
        return;
      }

      seen.add(normalizedName);
      normalizedEntries.push({ normalizedName, displayName: trimmedName });
    });

    const { data: projectLabels, error: projectLabelsError } = await supabase
      .from('project_labels')
      .select('id, name')
      .eq('project_id', projectId);

    if (projectLabelsError) {
      showMessage(messageElement, projectLabelsError.message || 'Failed to load project labels.', 'danger');
      return false;
    }

    let availableLabels = projectLabels || [];
    const existingByNormalizedName = new Map(
      availableLabels.map((label) => [normalizeLabelName(label.name), label])
    );

    const labelsToCreate = normalizedEntries
      .filter((entry) => !existingByNormalizedName.has(entry.normalizedName))
      .map((entry) => ({
        project_id: projectId,
        name: entry.displayName,
        created_by: session.user.id
      }));

    if (labelsToCreate.length) {
      const { error: createLabelsError } = await supabase.from('project_labels').insert(labelsToCreate);

      if (createLabelsError) {
        const duplicateError = String(createLabelsError.message || '').toLowerCase().includes('duplicate');
        if (!duplicateError) {
          showMessage(createLabelsError.message || 'Failed to create labels.', 'danger');
          return false;
        }
      }

      const { data: refreshedLabels, error: refreshedLabelsError } = await supabase
        .from('project_labels')
        .select('id, name')
        .eq('project_id', projectId);

      if (refreshedLabelsError) {
        showMessage(refreshedLabelsError.message || 'Failed to refresh labels.', 'danger');
        return false;
      }

      availableLabels = refreshedLabels || [];
      existingByNormalizedName.clear();
      availableLabels.forEach((label) => {
        existingByNormalizedName.set(normalizeLabelName(label.name), label);
      });
    }

    const desiredLabelIds = normalizedEntries
      .map((entry) => existingByNormalizedName.get(entry.normalizedName)?.id)
      .filter(Boolean);

    const { error: clearMappingsError } = await supabase.from('task_labels').delete().eq('task_id', taskId);
    if (clearMappingsError) {
      showMessage(clearMappingsError.message || 'Failed to update task labels.', 'danger');
      return false;
    }

    if (desiredLabelIds.length) {
      const insertRows = desiredLabelIds.map((labelId) => ({
        task_id: taskId,
        label_id: labelId
      }));

      const { error: insertMappingsError } = await supabase.from('task_labels').insert(insertRows);
      if (insertMappingsError) {
        showMessage(insertMappingsError.message || 'Failed to update task labels.', 'danger');
        return false;
      }
    }

    await refreshTaskLabelsForCurrentTasks();
    return true;
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
      .select('id, task_id, file_name, file_path, mime_type')
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
        mime_type: attachment.mime_type,
        signed_url: signedUrl
      });
    });

    attachmentsByTaskId = mappedAttachments;
    rerenderBoard();
  };

  const refreshTasksFromDatabase = async () => {
    const { data: latestTasks, error } = await supabase
      .from('tasks')
      .select('id, stage_id, title, description_html, order_position, done, deadline_date')
      .eq('project_id', projectId);

    if (error) {
      showMessage(messageElement, error.message || 'Failed to refresh tasks.', 'danger');
      return;
    }

    tasks.length = 0;
    tasks.push(...(latestTasks || []));
    await Promise.all([refreshAttachmentsForCurrentTasks(), refreshTaskLabelsForCurrentTasks()]);
  };

  const taskEditor = createTaskEditorController({
    page,
    supabase,
    sessionUserId: session.user.id,
    bucketName: TASK_ATTACHMENTS_BUCKET,
    showMessage: (message, variant = 'secondary') => showMessage(messageElement, message, variant),
    plainTextToHtml,
    htmlToPlainText,
    sanitizeFileName,
    escapeHtml,
    formatFileSize: (bytes) => {
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
      }

      const units = ['B', 'KB', 'MB', 'GB'];
      const sizeIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      const value = bytes / 1024 ** sizeIndex;
      return `${value.toFixed(sizeIndex === 0 ? 0 : 1)} ${units[sizeIndex]}`;
    },
    onSaved: async ({ mode }) => {
      await Promise.all([refreshAttachmentsForCurrentTasks(), refreshTaskLabelsForCurrentTasks()]);
      rerenderBoard();
      showMessage(messageElement, mode === 'add' ? 'Task created.' : 'Task updated.', 'success');
    },
    onAttachmentRemoved: async () => {
      await refreshAttachmentsForCurrentTasks();
      rerenderBoard();
    },
    onCommentAdded: async () => {
      showMessage(messageElement, '');
    }
  });

  taskEditor.setSaveHandler(async ({ mode, taskId, stageId, title, descriptionHtml, labelNames, deadlineDate, done }) => {
    if (mode === 'add') {
      showMessage(messageElement, 'Creating task...', 'secondary');

      const orderPosition = getNextTaskOrderPosition(tasks, stageId);
      const { data: insertedTask, error } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          stage_id: stageId,
          title,
          description_html: descriptionHtml,
          deadline_date: deadlineDate || null,
          done,
          order_position: orderPosition
        })
        .select('id, stage_id, title, description_html, order_position, done, deadline_date')
        .single();

      if (error || !insertedTask?.id) {
        showMessage(messageElement, error?.message || 'Failed to create task.', 'danger');
        return { success: false, taskId: '' };
      }

      insertedTask.labelNames = labelNames || [];
      tasks.push(insertedTask);

      const labelsSaved = await syncTaskLabels(insertedTask.id, labelNames || []);
      if (!labelsSaved) {
        showMessage(messageElement, 'Task created, but labels could not be saved.', 'warning');
      }

      return { success: true, taskId: insertedTask.id };
    }

    showMessage(messageElement, 'Updating task...', 'secondary');

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update({
        title,
        description_html: descriptionHtml,
        deadline_date: deadlineDate || null,
        done
      })
      .eq('id', taskId)
      .select('id, stage_id, title, description_html, order_position, done, deadline_date')
      .single();

    if (error || !updatedTask?.id) {
      showMessage(messageElement, error?.message || 'Failed to update task.', 'danger');
      return { success: false, taskId: '' };
    }

    const existingTask = tasks.find((item) => item.id === taskId);
    if (existingTask) {
      existingTask.title = updatedTask.title;
      existingTask.description_html = updatedTask.description_html;
      existingTask.done = updatedTask.done;
      existingTask.deadline_date = updatedTask.deadline_date;
      existingTask.stage_id = updatedTask.stage_id;
      existingTask.order_position = updatedTask.order_position;
      existingTask.labelNames = labelNames || [];
    }

    const labelsSaved = await syncTaskLabels(updatedTask.id, labelNames || []);
    if (!labelsSaved) {
      showMessage(messageElement, 'Task updated, but labels could not be saved.', 'warning');
    }

    return { success: true, taskId: updatedTask.id };
  });

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

      taskEditor.openEdit(task);
      return;
    }

    const action = actionElement.getAttribute('data-action');

    if (action === 'add-task') {
      taskEditor.openAdd(actionElement.getAttribute('data-stage-id'));
      return;
    }

    if (action === 'edit-task') {
      const cardElement = actionElement.closest('.board-task');
      const taskId = cardElement?.getAttribute('data-task-id');
      const task = tasks.find((item) => item.id === taskId);

      if (!task) {
        return;
      }

      taskEditor.openEdit(task);
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

  boardLabelFilterElement.addEventListener('change', () => {
    activeLabelFilterId = boardLabelFilterElement.value || '';
    rerenderBoard();
  });

  boardLabelFilterClearElement.addEventListener('click', () => {
    if (!activeLabelFilterId) {
      return;
    }

    activeLabelFilterId = '';
    boardLabelFilterElement.value = '';
    rerenderBoard();
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
      labelsByTaskId.delete(tasks[taskIndex].id);
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

  const commentsRealtimeChannel = supabase
    .channel(`project-task-comments-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_comments'
      },
      (payload) => {
        const changedTaskId = payload.new?.task_id || payload.old?.task_id;
        if (!changedTaskId) {
          return;
        }

        const isKnownTask = tasks.some((task) => task.id === changedTaskId);
        if (!isKnownTask || !taskEditor.isTaskOpenInEditor(changedTaskId)) {
          return;
        }

        if (commentsRealtimeRefreshTimer) {
          return;
        }

        commentsRealtimeRefreshTimer = window.setTimeout(async () => {
          commentsRealtimeRefreshTimer = null;
          await taskEditor.refreshCommentsForTask(changedTaskId);
        }, 120);
      }
    )
    .subscribe();

  const labelsRealtimeChannel = supabase
    .channel(`project-task-labels-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_labels'
      },
      (payload) => {
        const changedTaskId = payload.new?.task_id || payload.old?.task_id;
        if (!changedTaskId) {
          return;
        }

        const isKnownTask = tasks.some((task) => task.id === changedTaskId);
        if (!isKnownTask) {
          return;
        }

        if (labelsRealtimeRefreshTimer) {
          return;
        }

        labelsRealtimeRefreshTimer = window.setTimeout(async () => {
          labelsRealtimeRefreshTimer = null;
          await refreshTaskLabelsForCurrentTasks();
        }, 120);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_labels',
        filter: `project_id=eq.${projectId}`
      },
      () => {
        if (labelsRealtimeRefreshTimer) {
          return;
        }

        labelsRealtimeRefreshTimer = window.setTimeout(async () => {
          labelsRealtimeRefreshTimer = null;
          await refreshTaskLabelsForCurrentTasks();
        }, 120);
      }
    )
    .subscribe();

  const cleanupRealtime = () => {
    if (realtimeRefreshTimer) {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
    }

    if (commentsRealtimeRefreshTimer) {
      window.clearTimeout(commentsRealtimeRefreshTimer);
      commentsRealtimeRefreshTimer = null;
    }

    if (labelsRealtimeRefreshTimer) {
      window.clearTimeout(labelsRealtimeRefreshTimer);
      labelsRealtimeRefreshTimer = null;
    }

    supabase.removeChannel(realtimeChannel);
    supabase.removeChannel(commentsRealtimeChannel);
    supabase.removeChannel(labelsRealtimeChannel);
  };

  window.addEventListener('beforeunload', cleanupRealtime, { once: true });

  rerenderBoard();
  await Promise.all([refreshAttachmentsForCurrentTasks(), refreshTaskLabelsForCurrentTasks()]);
  enableDragAndDrop(boardColumnsElement, tasks, messageElement, () => {
    rerenderBoard();
  }, () => !activeLabelFilterId);
  showMessage(messageElement, '');

  return page;
}
