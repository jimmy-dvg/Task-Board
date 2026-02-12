import template from './footer.html?raw';
import './footer.css';

export function renderFooter() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;
  return wrapper.firstElementChild;
}
