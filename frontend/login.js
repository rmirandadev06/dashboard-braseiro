/* * ========================================
 * LÓGICA DA PÁGINA DE LOGIN
 * ========================================
 */

const API_URL = 'https://dashboard-braseiro-api.onrender.com/api';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const loginContainer = document.getElementById('login-container');

    // Verificar se já está logado
    const token = localStorage.getItem('authToken');
    if (token) {
        window.location.href = 'index.html';
        return;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Focar no campo de email ao carregar a página
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.focus();
    }

    async function handleLogin(event) {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const btnLogin = document.querySelector('.btn-login');

        // Validação básica
        if (!email || !senha) {
            showError('Por favor, preencha todos os campos.');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Por favor, insira um email válido.');
            return;
        }

        // Desabilita o botão para evitar cliques múltiplos
        btnLogin.disabled = true;
        btnLogin.textContent = 'Entrando...';
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';

        try {
            // Timeout para a requisição
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, senha }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro ao tentar fazer login');
            }

            // Login bem-sucedido
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            
            // Feedback visual de sucesso
            btnLogin.textContent = '✓ Login realizado!';
            btnLogin.style.backgroundColor = 'var(--success)';
            
            // Redirecionar após breve delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } catch (error) {
            console.error('Erro no login:', error);
            
            let errorMsg = error.message;
            if (error.name === 'AbortError') {
                errorMsg = 'Timeout: Servidor não respondeu. Tente novamente.';
            } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                errorMsg = 'Erro de conexão. Verifique sua internet e tente novamente.';
            }
            
            showError(errorMsg);
            
            // Efeito de shake no formulário
            loginContainer.classList.remove('shake');
            void loginContainer.offsetWidth; // Trigger reflow
            loginContainer.classList.add('shake');
            
            // Reabilita o botão
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Enter key para submit
    document.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            const focused = document.activeElement;
            if (focused && (focused.type === 'email' || focused.type === 'password')) {
                loginForm.dispatchEvent(new Event('submit'));
            }
        }
    });
});