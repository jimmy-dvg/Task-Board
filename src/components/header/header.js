import template from './header.html?raw';
import './header.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import { supabase } from '../../lib/supabase-client.js';

export function renderHeader(currentPath = '/') {
  const normalizePath = (path) => {
    if (!path || path === '/') {
      return '/';
    }

    return path.endsWith('/') ? path.slice(0, -1) : path;
  };

  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const normalizedCurrentPath = normalizePath(currentPath);

  wrapper.querySelectorAll('[data-route]').forEach((link) => {
    const routePath = normalizePath(link.getAttribute('data-route'));

    if (routePath === normalizedCurrentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  const headerElement = wrapper.firstElementChild;
  const dashboardNavItem = headerElement.querySelector('[data-auth-nav="dashboard"]');
  const loggedOutOnlyNavItems = headerElement.querySelectorAll('[data-auth-nav="logged-out-only"]');

  supabase.auth.getSession().then(({ data }) => {
    const hasSession = Boolean(data?.session);

    if (dashboardNavItem) {
      dashboardNavItem.classList.toggle('d-none', !hasSession);
    }

    loggedOutOnlyNavItems.forEach((item) => {
      item.classList.toggle('d-none', hasSession);
    });
  });

  return headerElement;
}
