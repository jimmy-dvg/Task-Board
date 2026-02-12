import template from './login.html?raw';
import './login.css';
import { supabase } from '../../lib/supabase-client.js';

function showMessage(messageElement, message, variant) {
  messageElement.className = `alert alert-${variant}`;
  messageElement.textContent = message;
}

export function renderLoginPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const form = page.querySelector('#loginForm');
  const submitButton = page.querySelector('#loginSubmit');
  const messageElement = page.querySelector('#loginMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '').trim();

    submitButton.disabled = true;
    showMessage(messageElement, 'Signing in...', 'secondary');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    submitButton.disabled = false;

    if (error) {
      showMessage(messageElement, error.message, 'danger');
      return;
    }

    showMessage(messageElement, 'Login successful. Redirecting to dashboard...', 'success');
    window.location.href = '/dashboard/';
  });

  return page;
}
