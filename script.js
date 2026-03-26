window.openModal = function(id) { 
    document.getElementById(id).classList.add('active'); 
};

window.closeModal = function(id) { 
    document.getElementById(id).classList.remove('active'); 
};

let currentUser = null;
let allQuestions = [];
let currentThreadId = null;

const SUPABASE_URL = 'https://hehnzvsgamcuumibrrix.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_sByLvbBCMmpQ7lSyqKPk1g_RFE33OS7';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const loginForm = document.getElementById('login-form');
    const loginPage = document.getElementById('login-page');
    const mainApp = document.getElementById('main-app');
    const authError = document.getElementById('auth-error');

    checkSession();

    async function checkSession() {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            loadApp(session.user);
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('pwd').value;
            const loginBtn = document.getElementById('login-btn');

            loginBtn.innerText = "Authenticating...";
            authError.innerText = "";
            
            const { data, error } = await _supabase.auth.signInWithPassword({
                email: email, 
                password: password
            });

            if (error) {
                authError.innerText = error.message;
                loginBtn.innerText = "Enter Ecosystem";
            } else {
                loadApp(data.user);
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            localStorage.removeItem('activeSection');
            await _supabase.auth.signOut();
            location.reload(); 
        });
    }

    async function loadApp(user) {
        currentUser = user; 
        loginPage.style.display = 'none';
        mainApp.style.display = 'flex';
        
        const { data: profile, error } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!error && profile) {
            const displayValue = profile.registration_number || user.email.split('@')[0]; 
            document.getElementById('sidebar-username').innerText = displayValue;
            document.getElementById('sidebar-avatar').innerText = displayValue.charAt(0).toUpperCase();
        }
        
        fetchVaultFiles();
        fetchWhispers();
        fetchQuestions(); 
        lucide.createIcons();

        const savedSection = localStorage.getItem('activeSection');
        if (savedSection) {
            const targetNavItem = document.querySelector(`.nav-item[data-section="${savedSection}"]`);
            if (targetNavItem) targetNavItem.click();
        }
    }

    const navItems = document.querySelectorAll('.side-nav .nav-item');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            sections.forEach(sec => sec.classList.add('hidden'));
            
            const targetSection = this.getAttribute('data-section');
            localStorage.setItem('activeSection', targetSection);

            const targetElement = document.getElementById(targetSection);
            if (targetElement) {
                targetElement.classList.remove('hidden');
            }
            
            if(targetSection === 'forum') {
                document.getElementById('forum-main-view').classList.remove('hidden');
                document.getElementById('forum-thread-view').classList.add('hidden');
                fetchQuestions();
            }
            if(targetSection === 'vault') fetchVaultFiles();
            if(targetSection === 'whisper') fetchWhispers();
        });
    });

    const contentContainer = document.getElementById('content-container');
    if (contentContainer) {
        contentContainer.addEventListener('click', async function(e) {
            if (e.target.closest('#forum-list') && e.target.closest('.forum-content') && !e.target.closest('button')) {
                const card = e.target.closest('.forum-card');
                const questionId = card.querySelector('.vote-sidebar').getAttribute('data-id');
                const question = allQuestions.find(q => q.id === questionId);
                if (question) openThread(question);
            }

            if (e.target.closest('#mark-solved-btn') || e.target.closest('#mark-unsolved-btn')) {
                const btn = e.target.closest('button');
                const questionId = btn.getAttribute('data-id');
                const action = btn.getAttribute('data-action'); 
                const newStatus = action === 'solve' ? 'Solved' : 'Unsolved';
                btn.innerText = "Updating...";
                btn.disabled = true;
                const { error } = await _supabase.from('forum_questions').update({ status: newStatus }).eq('id', questionId);
                if (!error) {
                    const qIndex = allQuestions.findIndex(q => q.id === questionId);
                    if(qIndex > -1) allQuestions[qIndex].status = newStatus;
                    openThread(allQuestions[qIndex]);
                    fetchQuestions(true); 
                } else {
                    alert("Error updating status: " + error.message);
                    btn.innerText = action === 'solve' ? "Mark as Solved" : "Mark as Unsolved";
                    btn.disabled = false;
                }
            }

            if (e.target.closest('.upvote') || e.target.closest('.downvote')) {
                const btn = e.target.closest('.vote-btn');
                const sidebar = btn.closest('.vote-sidebar');
                const recordId = sidebar.getAttribute('data-id');
                const isAnswer = sidebar.hasAttribute('data-is-answer');
                const isUp = btn.classList.contains('upvote');
                const voteValue = isUp ? 1 : -1;
                const tableTrack = isAnswer ? 'answer_votes' : 'question_votes';
                const colId = isAnswer ? 'answer_id' : 'question_id';
                const { error: trackError } = await _supabase.from(tableTrack).insert([{
                    [colId]: recordId,
                    user_id: currentUser.id,
                    vote_type: voteValue
                }]);
                if (trackError) {
                    if (trackError.code === '23505') alert("You have already voted on this!");
                    else alert("Database Error: " + trackError.message);
                    return;
                }
                const countSpan = sidebar.querySelector('.vote-count');
                let count = parseInt(countSpan.innerText) + voteValue;
                countSpan.innerText = count;
                if(isUp) sidebar.querySelector('.upvote').classList.add('active-up');
                else sidebar.querySelector('.downvote').classList.add('active-down');
                const tableMain = isAnswer ? 'forum_answers' : 'forum_questions';
                const colVotes = isAnswer ? 'upvotes' : 'votes';
                await _supabase.from(tableMain).update({ [colVotes]: count }).eq('id', recordId);
            }

            if(e.target.closest('.like-btn')) {
                const btn = e.target.closest('.like-btn');
                const whisperId = btn.getAttribute('data-id'); 
                const { error: trackError } = await _supabase.from('whisper_likes').insert([{
                    whisper_id: whisperId,
                    user_id: currentUser.id
                }]);
                if (trackError) {
                    if (trackError.code === '23505') alert("You have already liked this whisper!");
                    else alert("Database Error: " + trackError.message);
                    return;
                }
                const countSpan = btn.querySelector('.l-count');
                let count = parseInt(countSpan.innerText) + 1;
                countSpan.innerText = count;
                btn.classList.add('liked');
                await _supabase.from('whispers').update({ likes_count: count }).eq('id', whisperId);
            }
        });
    }

    const backToForumBtn = document.getElementById('back-to-forum');
    if (backToForumBtn) {
        backToForumBtn.addEventListener('click', () => {
            document.getElementById('forum-thread-view').classList.add('hidden');
            document.getElementById('forum-main-view').classList.remove('hidden');
            currentThreadId = null;
        });
    }

    function openThread(question) {
        currentThreadId = question.id;
        document.getElementById('forum-main-view').classList.add('hidden');
        document.getElementById('forum-thread-view').classList.remove('hidden');
        const statusClass = question.status === 'Solved' ? 'solved' : 'unsolved';
        const statusIcon = question.status === 'Solved' ? 'check-circle' : 'help-circle';
        let statusToggleBtn = '';
        if (currentUser && currentUser.id === question.author_id) {
            if (question.status !== 'Solved') {
                statusToggleBtn = `<button class="btn-success" id="mark-solved-btn" data-id="${question.id}" data-action="solve" style="float: right; margin-left: 10px;">
                                    <i data-lucide="check-circle" style="width: 16px;"></i> Mark as Solved
                                 </button>`;
            } else {
                statusToggleBtn = `<button class="btn-warning" id="mark-unsolved-btn" data-id="${question.id}" data-action="unsolve" style="float: right; margin-left: 10px;">
                                    <i data-lucide="rotate-ccw" style="width: 16px;"></i> Mark as Unsolved
                                 </button>`;
            }
        }
        document.getElementById('thread-original-question').innerHTML = `
            <div class="card forum-card" style="border-left: 4px solid var(--primary);">
                <div class="vote-sidebar" data-vote="none" data-id="${question.id}">
                    <button class="vote-btn upvote"><i data-lucide="chevron-up"></i></button>
                    <span class="vote-count">${question.votes}</span>
                    <button class="vote-btn downvote"><i data-lucide="chevron-down"></i></button>
                </div>
                <div class="forum-content" style="cursor: default;">
                    ${statusToggleBtn}
                    <h2>${question.title}</h2>
                    <p style="font-size: 1.05rem; margin-top: 10px; white-space: pre-wrap;">${question.description}</p>
                    <div class="forum-meta" style="margin-top: 20px;">
                        <span class="tag-status ${statusClass}"><i data-lucide="${statusIcon}" style="width: 14px;"></i> ${question.status}</span>
                        <span class="tag-topic">${question.topic}</span>
                        <span class="tag-topic">${question.branch}</span>
                    </div>
                </div>
            </div>`;
        lucide.createIcons();
        fetchAnswers(question.id);
    }

    async function fetchAnswers(questionId) {
        let answersData = [];
        const { data: answersWithProfile, error } = await _supabase.from('forum_answers').select(`*, profiles ( registration_number )`).eq('question_id', questionId).order('created_at', { ascending: true });
        if (error) {
            const { data: basicAnswers } = await _supabase.from('forum_answers').select('*').eq('question_id', questionId).order('created_at', { ascending: true });
            if (basicAnswers) answersData = basicAnswers;
        } else answersData = answersWithProfile;
        const listContainer = document.getElementById('thread-answers-list');
        listContainer.innerHTML = '';
        if (!answersData || answersData.length === 0) {
            listContainer.innerHTML = `<p style="color: var(--slate); text-align: center; padding: 20px;">No replies yet. Be the first!</p>`;
            return;
        }
        answersData.forEach(ans => {
            const authorReg = (ans.profiles && ans.profiles.registration_number) ? ans.profiles.registration_number : "Student";
            const date = new Date(ans.created_at).toLocaleDateString();
            listContainer.insertAdjacentHTML('beforeend', `
                <div class="answer-card">
                    <div class="vote-sidebar" data-id="${ans.id}" data-is-answer="true">
                        <button class="vote-btn upvote"><i data-lucide="chevron-up"></i></button>
                        <span class="vote-count">${ans.upvotes}</span>
                        <button class="vote-btn downvote"><i data-lucide="chevron-down"></i></button>
                    </div>
                    <div style="flex: 1;">
                        <div class="answer-author"><div class="avatar">${authorReg.charAt(0).toUpperCase()}</div>${authorReg} <span class="answer-date">• ${date}</span></div>
                        <p style="line-height: 1.5; color: var(--dark); white-space: pre-wrap;">${ans.answer_text}</p>
                    </div>
                </div>`);
        });
        lucide.createIcons();
    }

    const postAnswerBtn = document.getElementById('post-answer-btn');
    if (postAnswerBtn) {
        postAnswerBtn.addEventListener('click', async () => {
            if (!currentThreadId || !currentUser) return;
            const textArea = document.getElementById('answer-text');
            const text = textArea.value;
            if (!text.trim()) return alert("Please write a reply.");
            postAnswerBtn.innerText = "Posting...";
            const { error } = await _supabase.from('forum_answers').insert([{ question_id: currentThreadId, author_id: currentUser.id, answer_text: text, upvotes: 0 }]);
            if (error) alert("Failed to post reply.");
            else { textArea.value = ''; fetchAnswers(currentThreadId); }
            postAnswerBtn.innerText = "Post Reply";
        });
    }

    async function fetchQuestions(silent = false) {
        const { data: questions, error } = await _supabase.from('forum_questions').select('*').order('created_at', { ascending: false });
        if (error) return;
        const badge = document.getElementById('forum-badge');
        if (badge) { badge.innerText = questions.length; badge.style.display = questions.length > 0 ? 'block' : 'none'; }
        allQuestions = questions; 
        const listContainer = document.getElementById('forum-list');
        if(!silent) listContainer.innerHTML = ''; 
        let newHtml = '';
        questions.forEach(q => {
            const statusClass = q.status === 'Solved' ? 'solved' : 'unsolved';
            newHtml += `
                <div class="card forum-card" data-topic="${q.topic}" data-branch="${q.branch}" data-status="${q.status}">
                    <div class="vote-sidebar" data-id="${q.id}">
                        <button class="vote-btn upvote"><i data-lucide="chevron-up"></i></button>
                        <span class="vote-count">${q.votes}</span>
                        <button class="vote-btn downvote"><i data-lucide="chevron-down"></i></button>
                    </div>
                    <div class="forum-content">
                        <h3>${q.title}</h3>
                        <p>${q.description.substring(0, 100)}${q.description.length > 100 ? '...' : ''}</p>
                        <div class="forum-meta">
                            <span class="tag-status ${statusClass}">${q.status}</span>
                            <span class="tag-topic">${q.topic}</span>
                            <span class="tag-topic">${q.branch}</span>
                        </div>
                    </div>
                </div>`;
        });
        listContainer.innerHTML = newHtml;
        lucide.createIcons();
    }

    const saveQuestionBtn = document.getElementById('save-question');
    if (saveQuestionBtn) {
        saveQuestionBtn.addEventListener('click', async () => {
            const title = document.getElementById('q-title').value;
            const desc = document.getElementById('q-desc').value;
            const branch = document.getElementById('q-branch').value;
            const topic = document.getElementById('q-topic').value;
            if(!title || !desc) return alert("Please enter a title and description");
            saveQuestionBtn.innerText = "Posting...";
            const { error } = await _supabase.from('forum_questions').insert([{ title: title, description: desc, branch: branch, topic: topic, status: 'Unsolved', votes: 0, author_id: currentUser.id }]);
            if (error) alert("Failed to post question: " + error.message);
            else { window.closeModal('question-modal'); document.getElementById('q-title').value = ''; document.getElementById('q-desc').value = ''; fetchQuestions(); }
            saveQuestionBtn.innerText = "Post Question";
        });
    }

    async function fetchWhispers() {
        const { data: whispers, error } = await _supabase.from('whispers').select('*').order('created_at', { ascending: false });
        if (error) return;
        const listContainer = document.getElementById('whisper-list');
        listContainer.innerHTML = ''; 
        whispers.forEach(whisper => {
            const date = new Date(whisper.created_at).toLocaleDateString();
            listContainer.insertAdjacentHTML('beforeend', `
                <div class="card whisper-card">
                    <div class="whisper-header"><span class="anon-badge">Anon</span></div>
                    <p>${whisper.message_text}</p>
                    <div class="whisper-footer">
                        <button class="like-btn" data-id="${whisper.id}"><i data-lucide="thumbs-up" style="width: 16px;"></i> <span class="l-count">${whisper.likes_count}</span></button>
                        <span>${date}</span>
                    </div>
                </div>`);
        });
        lucide.createIcons();
    }

    const postWhisperBtn = document.getElementById('post-whisper-btn');
    if (postWhisperBtn) {
        postWhisperBtn.addEventListener('click', async () => {
            const textInput = document.getElementById('whisper-text');
            if(!textInput.value.trim()) return;
            postWhisperBtn.innerText = "Posting...";
            const { error } = await _supabase.from('whispers').insert([{ message_text: textInput.value, likes_count: 0 }]);
            if (!error) { textInput.value = ''; fetchWhispers(); }
            postWhisperBtn.innerText = "Post Whisper";
        });
    }

    async function fetchVaultFiles() {
        const { data: files, error = null } = await _supabase.from('vault_files').select('*').order('created_at', { ascending: false });
        if (error) return;
        const listContainer = document.getElementById('vault-list');
        listContainer.innerHTML = '';
        files.forEach(file => {
            listContainer.insertAdjacentHTML('beforeend', `
                <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div><h3>${file.title}</h3><p style="color: var(--slate); font-size: 0.85rem; margin-top: 5px;">Course: ${file.course_code}</p></div>
                    <a href="${file.file_url}" target="_blank"><button class="btn-secondary">Download</button></a>
                </div>`);
        });
        lucide.createIcons();
    }

    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            const fileInput = document.getElementById('file-upload');
            const titleInput = document.getElementById('file-title').value;
            const statusText = document.getElementById('upload-status');
            if (!fileInput.files.length || !titleInput) return;
            statusText.innerText = "Uploading..."; 
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_${file.name}`;
            const { error: uploadError } = await _supabase.storage.from('academic_vault').upload(fileName, file);
            if (uploadError) return statusText.innerText = "Error.";
            const { data: publicUrlData } = _supabase.storage.from('academic_vault').getPublicUrl(fileName);
            const { error: dbError } = await _supabase.from('vault_files').insert([{ title: titleInput, course_code: document.getElementById('course-code').value, file_url: publicUrlData.publicUrl }]);
            if (dbError) statusText.innerText = "Error."; 
            else { statusText.innerText = "Done!"; document.getElementById('file-title').value = ''; document.getElementById('course-code').value = ''; fetchVaultFiles(); }
        });
    }
});
