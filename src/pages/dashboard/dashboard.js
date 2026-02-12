import template from './dashboard.html?raw';
import './dashboard.css';

export function renderDashboardPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;
  return wrapper.firstElementChild;
}
