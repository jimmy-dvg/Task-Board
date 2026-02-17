import { Modal } from 'bootstrap';
import './task-editor.css';

function isImageAttachment(attachment) {
  const mimeType = String(attachment.mime_type || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  const fileName = String(attachment.file_name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg|ico|avif)$/i.test(fileName);
}

function resolveFileIconClass(fileName) {
  const ext = String(fileName || '').toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    return 'bi bi-file-earmark-pdf';
  }

  if (['doc', 'docx', 'odt'].includes(ext)) {
    return 'bi bi-file-earmark-word';
  }

  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'bi bi-file-earmark-spreadsheet';
  }

  if (['ppt', 'pptx'].includes(ext)) {
    return 'bi bi-file-earmark-slides';
  }

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'bi bi-file-earmark-zip';
  }

  if (['txt', 'md', 'json', 'xml', 'yml', 'yaml', 'log'].includes(ext)) {
    return 'bi bi-file-earmark-text';
  }

  return 'bi bi-file-earmark';
}

export function createTaskEditorController({
  page,
  supabase,
  sessionUserId,
  bucketName,
  showMessage,
  plainTextToHtml,
  htmlToPlainText,
  sanitizeFileName,
  escapeHtml,
  formatFileSize,
  onSaved,
  onAttachmentRemoved
}) {
  const taskModalElement = page.querySelector('#taskModal');
  const taskModalLabelElement = page.querySelector('#taskModalLabel');
  const taskFormElement = page.querySelector('#taskForm');
  const taskTitleInput = page.querySelector('#taskTitle');
  const taskDescriptionInput = page.querySelector('#taskDescription');
  const taskTitleFeedback = page.querySelector('#taskTitleFeedback');
  const taskDescriptionFeedback = page.querySelector('#taskDescriptionFeedback');
  const taskAttachmentsInput = page.querySelector('#taskAttachmentsInput');
  const taskAttachmentsList = page.querySelector('#taskAttachmentsList');
  const taskStatusInput = page.querySelector('#taskStatus');
  const taskStatusButtons = [...page.querySelectorAll('.task-status-btn')];
  const taskFormSubmitButton = page.querySelector('#taskFormSubmit');

  const taskModal = new Modal(taskModalElement);

  let taskFormMode = 'add';
  let activeTaskId = '';
  let activeStageId = '';
  let activeTaskAttachments = [];
  let saveHandler = async () => ({ success: false, taskId: '' });

  const clearFieldError = (inputElement, feedbackElement) => {
    inputElement.classList.remove('is-invalid');
    feedbackElement.textContent = '';
  };

  const setFieldError = (inputElement, feedbackElement, message) => {
    inputElement.classList.add('is-invalid');
    feedbackElement.textContent = message;
  };

  const clearTaskFormValidation = () => {
    clearFieldError(taskTitleInput, taskTitleFeedback);
    clearFieldError(taskDescriptionInput, taskDescriptionFeedback);
  };

  const setStatus = (statusValue) => {
    const normalizedStatus = statusValue === 'done' ? 'done' : 'open';
    taskStatusInput.value = normalizedStatus;

    taskStatusButtons.forEach((button) => {
      const isActive = button.getAttribute('data-status-value') === normalizedStatus;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const renderTaskAttachmentsList = () => {
    if (!activeTaskAttachments.length) {
      taskAttachmentsList.innerHTML = '<small class="text-body-secondary">No attachments yet.</small>';
      return;
    }

    taskAttachmentsList.innerHTML = activeTaskAttachments
      .map((attachment) => {
        const safeAttachmentName = escapeHtml(attachment.file_name || 'Attachment');

        const preview = isImageAttachment(attachment)
          ? `<img class="task-attachment-preview" src="${attachment.signed_url}" alt="${safeAttachmentName}" />`
          : `<span class="task-attachment-icon"><i class="${resolveFileIconClass(attachment.file_name)}" aria-hidden="true"></i></span>`;

        return `
          <div class="task-attachment-item">
            <div class="task-attachment-main">
              ${preview}
              <div>
                <a href="${attachment.signed_url}" target="_blank" rel="noopener noreferrer" class="task-attachment-name">${safeAttachmentName}</a>
                <div><small class="text-body-secondary">${formatFileSize(attachment.file_size)}</small></div>
              </div>
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
        `;
      })
      .join('');
  };

  const loadTaskAttachments = async (taskId) => {
    const { data: rows, error } = await supabase
      .from('task_attachments')
      .select('id, file_name, file_path, file_size, mime_type')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      showMessage(error.message || 'Failed to load attachments.', 'danger');
      activeTaskAttachments = [];
      renderTaskAttachmentsList();
      return;
    }

    const attachments = rows || [];
    const signedUrlResults = await Promise.all(
      attachments.map((attachment) => supabase.storage.from(bucketName).createSignedUrl(attachment.file_path, 3600))
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
        .from(bucketName)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream'
        });

      if (uploadError) {
        showMessage(uploadError.message || 'Failed to upload attachment.', 'danger');
        return { success: false };
      }

      const { error: insertError } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
        created_by: sessionUserId
      });

      if (insertError) {
        showMessage(insertError.message || 'Failed to save attachment metadata.', 'danger');
        return { success: false };
      }
    }

    taskAttachmentsInput.value = '';
    return { success: true };
  };

  taskAttachmentsList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-action="remove-attachment"]');
    if (!removeButton) {
      return;
    }

    (async () => {
      const attachmentId = removeButton.getAttribute('data-attachment-id');
      const attachmentPath = removeButton.getAttribute('data-attachment-path');

      if (!attachmentId || !attachmentPath || !activeTaskId) {
        return;
      }

      removeButton.disabled = true;
      showMessage('Removing attachment...', 'secondary');

      const { error: storageError } = await supabase.storage.from(bucketName).remove([attachmentPath]);
      if (storageError) {
        showMessage(storageError.message || 'Failed to remove attachment file.', 'danger');
        removeButton.disabled = false;
        return;
      }

      const { error: rowError } = await supabase.from('task_attachments').delete().eq('id', attachmentId);
      if (rowError) {
        showMessage(rowError.message || 'Failed to remove attachment metadata.', 'danger');
        removeButton.disabled = false;
        return;
      }

      activeTaskAttachments = activeTaskAttachments.filter((attachment) => attachment.id !== attachmentId);
      renderTaskAttachmentsList();
      await onAttachmentRemoved?.(activeTaskId);
      showMessage('Attachment removed.', 'success');
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

  taskStatusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setStatus(button.getAttribute('data-status-value'));
    });
  });

  taskModalElement.addEventListener('hidden.bs.modal', () => {
    clearTaskFormValidation();
  });

  taskFormElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTaskFormValidation();

    const title = taskTitleInput.value.trim();
    const descriptionHtml = plainTextToHtml(taskDescriptionInput.value.trim());
    const done = taskStatusInput.value === 'done';

    if (!title) {
      setFieldError(taskTitleInput, taskTitleFeedback, 'Title is required.');
      taskTitleInput.focus();
      return;
    }

    taskFormSubmitButton.disabled = true;

    const saveResult = await saveHandler({
      mode: taskFormMode,
      taskId: activeTaskId,
      stageId: activeStageId,
      title,
      descriptionHtml,
      done
    });

    if (!saveResult?.success || !saveResult.taskId) {
      taskFormSubmitButton.disabled = false;
      return;
    }

    const uploadResult = await uploadSelectedAttachments(saveResult.taskId);
    taskFormSubmitButton.disabled = false;

    if (!uploadResult.success) {
      return;
    }

    await onSaved?.({
      mode: taskFormMode,
      taskId: saveResult.taskId
    });

    taskModal.hide();
  });

  const openAdd = (stageId) => {
    taskFormMode = 'add';
    activeTaskId = '';
    activeStageId = stageId;
    activeTaskAttachments = [];
    taskModalLabelElement.textContent = 'Add Task';
    taskFormSubmitButton.textContent = 'Create';
    taskFormElement.reset();
    clearTaskFormValidation();
    setStatus('open');
    taskAttachmentsInput.value = '';
    renderTaskAttachmentsList();
    taskModal.show();
    taskTitleInput.focus();
  };

  const openEdit = async (task) => {
    taskFormMode = 'edit';
    activeTaskId = task.id;
    activeStageId = task.stage_id;
    taskModalLabelElement.textContent = 'Edit Task';
    taskFormSubmitButton.textContent = 'Update';
    clearTaskFormValidation();
    taskTitleInput.value = task.title || '';
    taskDescriptionInput.value = htmlToPlainText(task.description_html || '');
    setStatus(task.done ? 'done' : 'open');
    taskAttachmentsInput.value = '';
    activeTaskAttachments = [];
    renderTaskAttachmentsList();
    taskModal.show();
    taskTitleInput.focus();
    await loadTaskAttachments(task.id);
  };

  const setSaveHandler = (handler) => {
    saveHandler = handler;
  };

  renderTaskAttachmentsList();
  setStatus('open');

  return {
    openAdd,
    openEdit,
    setSaveHandler
  };
}
