import template from './register.html?raw';
import './register.css';
import { supabase } from '../../lib/supabase-client.js';

function showMessage(messageElement, message, variant) {
  messageElement.className = `alert alert-${variant}`;
  messageElement.textContent = message;
}

export function renderRegisterPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const form = page.querySelector('#registerForm');
  const submitButton = page.querySelector('#registerSubmit');
  const messageElement = page.querySelector('#registerMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '').trim();

    submitButton.disabled = true;
    showMessage(messageElement, 'Creating account...', 'secondary');

    const { error } = await supabase.auth.signUp({ email, password });

    submitButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    showMessage(messageElement, 'Registration successful. Please login.', 'success');
    window.setTimeout(() => {
      window.location.href = '/login/';
    }, 900);
  });

  return page;
}
