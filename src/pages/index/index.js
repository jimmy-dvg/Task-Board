import template from './index.html?raw';
import './index.css';

export function renderIndexPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;
  return wrapper.firstElementChild;
}
