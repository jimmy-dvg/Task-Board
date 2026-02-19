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

  showMessage(messageElement, 'Loading activity...', 'secondary');

  const [projectResult, logsResult] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).single(),
    supabase
      .from('task_activity_logs')
      .select('id, task_id, actor_id, action, details, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(500)
  ]);

  if (projectResult.error || logsResult.error) {
    showMessage(messageElement, projectResult.error?.message || logsResult.error?.message || 'Failed to load activity.', 'danger');
    activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">Unable to load activity logs.</td></tr>';
    return page;
  }

  const logs = logsResult.data || [];
  projectNameElement.textContent = projectResult.data?.name ? `Project: ${projectResult.data.name}` : 'Project';

  if (!logs.length) {
    activityActionFilter.innerHTML = '<option value="">All actions</option>';
    activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No task activity yet.</td></tr>';
    showMessage(messageElement, '');
    return page;
  }

  const actorIds = [...new Set(logs.map((log) => log.actor_id).filter(Boolean))];
  let actorById = new Map();

  if (actorIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', actorIds);

    if (profilesError) {
      showMessage(messageElement, profilesError.message || 'Failed to load activity authors.', 'danger');
    } else {
      actorById = new Map((profiles || []).map((profile) => [profile.id, profile.email]));
    }
  }

  const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort((a, b) =>
    formatActionLabel(a).localeCompare(formatActionLabel(b), undefined, { sensitivity: 'base' })
  );

  activityActionFilter.innerHTML = [
    '<option value="">All actions</option>',
    ...actions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(formatActionLabel(action))}</option>`)
  ].join('');

  const renderRows = () => {
    const actionFilter = activityActionFilter.value;
    const filteredLogs = actionFilter ? logs.filter((log) => log.action === actionFilter) : logs;

    if (!filteredLogs.length) {
      activityTableBody.innerHTML = '<tr><td colspan="5" class="text-body-secondary">No activity for this action.</td></tr>';
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

  activityActionFilter.addEventListener('change', renderRows);

  renderRows();
  showMessage(messageElement, '');

  return page;
}
