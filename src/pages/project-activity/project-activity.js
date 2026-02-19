import template from './project-activity.html?raw';
import './project-activity.css';
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
  const pathMatch = window.location.pathname.match(/^\/project\/([^/]+)\/activity\/?$/);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('id');
}

function formatActionLabel(action) {
  return String(action || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function summarizeDetails(details) {
  if (!details || typeof details !== 'object') {
    return '';
  }

  const changedFields = Array.isArray(details.changed_fields) ? details.changed_fields : [];

  if (changedFields.length) {
    return `Changed: ${changedFields.join(', ')}`;
  }

  if (details.label_name) {
    return `Label: ${details.label_name}`;
  }

  if (details.file_name) {
    return `File: ${details.file_name}`;
  }

  if (details.comment_preview) {
    return String(details.comment_preview);
  }

  if (details.deadline_date) {
    return `Deadline: ${details.deadline_date}`;
  }

  return '';
}

export async function renderProjectActivityPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const messageElement = page.querySelector('#activityMessage');
  const projectNameElement = page.querySelector('#activityProjectName');
  const activityLiveStatusElement = page.querySelector('#activityLiveStatus');
  const activityBoardLink = page.querySelector('#activityBoardLink');
  const activityActionFilter = page.querySelector('#activityActionFilter');
  const activityTableBody = page.querySelector('#activityTableBody');

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
    activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Project id is missing.</td></tr>';
    return page;
  }

  activityBoardLink.href = `/project/${projectId}/tasks`;

  let logs = [];
  let actorById = new Map();
  let refreshTimer = null;
  let isRefreshing = false;

  const setLiveStatus = (status) => {
    const normalizedStatus = String(status || '').toUpperCase();

    activityLiveStatusElement.classList.remove('is-live', 'is-connecting');

    if (normalizedStatus === 'SUBSCRIBED') {
      activityLiveStatusElement.textContent = 'Live';
      activityLiveStatusElement.classList.add('is-live');
      activityLiveStatusElement.title = 'Realtime connected';
      return;
    }

    if (normalizedStatus === 'CHANNEL_ERROR' || normalizedStatus === 'TIMED_OUT') {
      activityLiveStatusElement.textContent = 'Reconnecting';
      activityLiveStatusElement.classList.add('is-connecting');
      activityLiveStatusElement.title = 'Realtime reconnecting';
      return;
    }

    activityLiveStatusElement.textContent = 'Offline';
    activityLiveStatusElement.title = 'Realtime disconnected';
  };

  const renderRows = () => {
    const actionFilter = activityActionFilter.value;
    const filteredLogs = actionFilter ? logs.filter((log) => log.action === actionFilter) : logs;

    if (!filteredLogs.length) {
      activityTableBody.innerHTML = actionFilter
        ? '<tr><td colspan="5" class="text-body-secondary">No activity for this action.</td></tr>'
        : '<tr><td colspan="5" class="text-body-secondary">No task activity yet.</td></tr>';
      return;
    }

    activityTableBody.innerHTML = filteredLogs
      .map((log) => {
        const taskTitle = escapeHtml(log.details?.task_title || log.task_id || 'Task');
        const actionLabel = escapeHtml(formatActionLabel(log.action));
        const detailsText = escapeHtml(summarizeDetails(log.details));
        const actorEmail = escapeHtml(actorById.get(log.actor_id) || 'Unknown');
        const createdAt = escapeHtml(formatDateTime(log.created_at));

        return `
          <tr>
            <td>${createdAt}</td>
            <td>${taskTitle}</td>
            <td><span class="badge text-bg-light activity-action-pill">${actionLabel}</span></td>
            <td>${detailsText || '<span class="text-body-secondary">-</span>'}</td>
            <td>${actorEmail}</td>
          </tr>
        `;
      })
      .join('');
  };

  const renderActionFilterOptions = () => {
    const selectedAction = activityActionFilter.value;
    const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort((a, b) =>
      formatActionLabel(a).localeCompare(formatActionLabel(b), undefined, { sensitivity: 'base' })
    );

    activityActionFilter.innerHTML = [
      '<option value="">All actions</option>',
      ...actions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(formatActionLabel(action))}</option>`)
    ].join('');

    if (selectedAction && actions.includes(selectedAction)) {
      activityActionFilter.value = selectedAction;
    } else {
      activityActionFilter.value = '';
    }
  };

  const loadActivity = async ({ showLoading = false } = {}) => {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;

    if (showLoading) {
      showMessage(messageElement, 'Loading activity...', 'secondary');
    }

    const { data: logRows, error: logsError } = await supabase
      .from('task_activity_logs')
      .select('id, task_id, actor_id, action, details, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (logsError) {
      showMessage(messageElement, logsError.message || 'Failed to load activity.', 'danger');
      activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Unable to load activity logs.</td></tr>';
      isRefreshing = false;
      return;
    }

    logs = logRows || [];
    const actorIds = [...new Set(logs.map((log) => log.actor_id).filter(Boolean))];

    if (actorIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', actorIds);

      if (profilesError) {
        showMessage(messageElement, profilesError.message || 'Failed to load activity authors.', 'danger');
        actorById = new Map();
      } else {
        actorById = new Map((profiles || []).map((profile) => [profile.id, profile.email]));
      }
    } else {
      actorById = new Map();
    }

    renderActionFilterOptions();
    renderRows();
    showMessage(messageElement, '');
    isRefreshing = false;
  };

  showMessage(messageElement, 'Loading activity...', 'secondary');

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single();

  if (projectError) {
    showMessage(messageElement, projectError.message || 'Failed to load activity.', 'danger');
    activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Unable to load activity logs.</td></tr>';
    return page;
  }

  projectNameElement.textContent = project?.name ? `Project: ${project.name}` : 'Project';

  activityActionFilter.addEventListener('change', renderRows);

  await loadActivity({ showLoading: false });

  const activityRealtimeChannel = supabase
    .channel(`project-task-activity-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_activity_logs',
        filter: `project_id=eq.${projectId}`
      },
      () => {
        if (refreshTimer) {
          return;
        }

        refreshTimer = window.setTimeout(async () => {
          refreshTimer = null;
          await loadActivity();
        }, 150);
      }
    )
    .subscribe((status) => {
      setLiveStatus(status);
    });

  setLiveStatus('CHANNEL_ERROR');

  const cleanupRealtime = () => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    setLiveStatus('CLOSED');
    supabase.removeChannel(activityRealtimeChannel);
  };

  window.addEventListener('beforeunload', cleanupRealtime, { once: true });

  return page;
}
