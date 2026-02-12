import template from './header.html?raw';
import './header.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

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

  return wrapper.firstElementChild;
}
