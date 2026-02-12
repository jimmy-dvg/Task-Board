import template from './header.html?raw';
import './header.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

export function renderHeader(currentPath = '/') {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  wrapper.querySelectorAll('[data-route]').forEach((link) => {
    if (link.getAttribute('data-route') === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  return wrapper.firstElementChild;
}
