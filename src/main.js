// Initial Mock State
const defaultState = {
  users: [
    { id: 1, name: 'Franklin', role: 'Líder', points: 0 },
    { id: 2, name: 'Raone', role: 'Líder', points: 0 },
    { id: 3, name: 'Marcelo', role: 'Líder', points: 0 },
    { id: 4, name: 'Leonardo', role: 'Líder', points: 0 },
    { id: 5, name: 'Arilson', role: 'Líder', points: 0 },
    { id: 6, name: 'Ueslei', role: 'Auxiliar', points: 0 },
    { id: 7, name: 'Guilherme', role: 'Auxiliar', points: 0 },
    { id: 8, name: 'Jeferson', role: 'Auxiliar', points: 0 },
    { id: 9, name: 'Arthur', role: 'Auxiliar', points: 0 },
    { id: 10, name: 'Fernando', role: 'Auxiliar', points: 0 },
  ],
  trips: [],
  folgas: []
};

// Load state from localStorage or use default
let stateString = localStorage.getItem('travelScheduleState_v2');
let state = stateString ? JSON.parse(stateString) : JSON.parse(JSON.stringify(defaultState));

// Migração Cauê -> Jeferson
if (stateString) {
  state.users.forEach(u => {
    if(u.id === 8 && u.name === 'Cauê') u.name = 'Jeferson';
  });
}

// Migração: Garante que campos novos existam
if (!state.folgas) state.folgas = [];
if (state.trips) {
  state.trips.forEach(t => {
    if (t.days === undefined) t.days = 1;
  });
}

// Contexts for modals
let tradeContext = { tripId: null, targetRole: null, currentUserBeingReplaced: null };
let editContext = { tripId: null };
let createContext = { expectedLeaderId: null, expectedAssistantId: null };

// === AUTHENTICATION ===
let isAuthenticated = sessionStorage.getItem('isAdmin') === 'true';
let pendingAction = null;

window.requireAuth = (callback) => {
  if (isAuthenticated) {
    callback();
  } else {
    pendingAction = callback;
    document.getElementById('authPassword').value = '';
    document.getElementById('authModal').showModal();
    setTimeout(() => document.getElementById('authPassword').focus(), 100);
  }
};

// Pointers for round-robin - recalculate based on last original leaders/assistants in state
let nextLeaderIndex = 0;
let nextAssistantIndex = 0;
let currentMonthFilter = '';

function saveState() {
  localStorage.setItem('travelScheduleState_v2', JSON.stringify(state));
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'danger' ? 'toast-danger' : ''}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function calculatePoints() {
  state.users.forEach(u => {
    u.points = 0;
    u.history = [];
  });
  
  // Pontos de Viagens
  state.trips.forEach(trip => {
    const tripDays = trip.dailyLog ? trip.dailyLog.length : (trip.days || 1);
    const l = state.users.find(u => u.id === trip.leaderId);
    const ol = state.users.find(u => u.id === trip.originalLeaderId);
    const a = state.users.find(u => u.id === trip.assistantId);
    const oa = state.users.find(u => u.id === trip.originalAssistantId);

    let typeStr = '';
    if(trip.dailyLog && trip.dailyLog.length > 0) {
      let v = 0, t = 0;
      trip.dailyLog.forEach(d => { if(d.type === 'VIGI') v++; else t++; });
      typeStr = ` (${v} VIGI, ${t} Trans)`;
    }

    // Leader Logic
    if (ol && ol.id !== l?.id) {
      ol.points -= tripDays;
      ol.history.push({ date: trip.date, desc: `Passou viagem #${trip.id} para ${l ? l.name : '?'}`, val: -tripDays });
      
      if (l) {
        l.points += tripDays;
        l.history.push({ date: trip.date, desc: `Substituiu ${ol.name} na viagem #${trip.id}${typeStr}`, val: tripDays });
      }
    } else {
      if (l) {
        l.points += tripDays;
        l.history.push({ date: trip.date, desc: `Viagem #${trip.id} (Seu dia)${typeStr}`, val: tripDays });
      }
    }

    // Assistant Logic
    if (oa && oa.id !== a?.id) {
      oa.points -= tripDays;
      oa.history.push({ date: trip.date, desc: `Passou viagem #${trip.id} para ${a ? a.name : '?'}`, val: -tripDays });
      
      if (a) {
        a.points += tripDays;
        a.history.push({ date: trip.date, desc: `Substituiu ${oa.name} na viagem #${trip.id}${typeStr}`, val: tripDays });
      }
    } else {
      if (a) {
        a.points += tripDays;
        a.history.push({ date: trip.date, desc: `Viagem #${trip.id} (Seu dia)${typeStr}`, val: tripDays });
      }
    }
  });

  // Sort history by date
  state.users.forEach(u => {
    if (u.history) {
      u.history.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  });
}

function getMedal(points, rankIndex) {
  if (points <= 0) return '';
  if (rankIndex === 0) return '🥇'; // Top 1
  if (rankIndex === 1) return '🥈'; // Top 2
  if (rankIndex === 2) return '🥉'; // Top 3
  if (points >= 5) return '🎖️';     // Reached 5+ trips minimum score
  return '';
}

function formatDate(isoString) {
  if(!isoString) return '';
  const parts = isoString.split('-');
  if(parts.length !== 3) return isoString;
  const [yy, mm, dd] = parts;
  return `${dd}/${mm}/${yy}`;
}

function renderLeaderboard() {
  calculatePoints();
  const list = document.getElementById('leaderboard');
  list.innerHTML = '';
  // sort by points first, then alphabetically
  const sortedUsers = [...state.users].sort((a,b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });
  
  sortedUsers.forEach((user, index) => {
    const li = document.createElement('li');
    li.className = 'clickable-row';
    li.title = "Clique para ver o extrato de pontos";
    li.onclick = () => openHistoryModal(user.id);
    li.innerHTML = `
      <div>
        <span class="user-name"><span class="medal">${getMedal(user.points, index)}</span> ${user.name}</span>
        <span class="user-role">${user.role}</span>
      </div>
      <span class="user-points">${user.points} pts</span>
    `;
    list.appendChild(li);
  });
}

function renderTeams() {
  const list = document.getElementById('teamsList');
  if(!list) return;
  list.innerHTML = '';
  const leaders = state.users.filter(u => u.role === 'Líder');
  const assistants = state.users.filter(u => u.role === 'Auxiliar');
  
  const totalTeams = Math.max(leaders.length, assistants.length);
  for(let i=0; i<totalTeams; i++) {
     const l = leaders[i];
     const a = assistants[i];
     const li = document.createElement('li');
     li.style.flexDirection = 'column';
     li.style.alignItems = 'flex-start';
     li.innerHTML = `
        <strong style="color:var(--primary); margin-bottom:0.2rem">Equipe ${i+1}</strong>
        <div style="font-size:0.85rem; color:var(--text-muted);">
           <strong>Líder:</strong> ${l ? l.name : '-'} <br>
           <strong>Auxiliar:</strong> ${a ? a.name : '-'}
        </div>
     `;
     list.appendChild(li);
  }
}

function getStatusBadge(status) {
  if (status.includes('Trocado')) return `<span class="status-badge status-trocado">${status}</span>`;
  if (status === 'Confirmado') return `<span class="status-badge status-confirmado">[✔] Confirmado</span>`;
  return `<span class="status-badge status-pendente">${status}</span>`;
}

function renderSchedule() {
  const tbody = document.getElementById('scheduleBody');
  tbody.innerHTML = '';
  
  const tripsToRender = currentMonthFilter 
    ? state.trips.filter(t => t.date.startsWith(currentMonthFilter))
    : state.trips;
  
  tripsToRender.forEach(trip => {
    const leader = state.users.find(u => u.id === trip.leaderId);
    const assistant = state.users.find(u => u.id === trip.assistantId);
    
    let originalText = '';
    if (trip.originalLeaderId) {
      const ol = state.users.find(u => u.id === trip.originalLeaderId);
      originalText += `Líder Orig: ${ol ? ol.name : '?'}<br>`;
    }
    if (trip.originalAssistantId) {
      const oa = state.users.find(u => u.id === trip.originalAssistantId);
      originalText += `Aux Orig: ${oa ? oa.name : '?'}`;
    }

    let vigiCount = 0, transCount = 0;
    if(trip.dailyLog) {
      trip.dailyLog.forEach(d => { if(d.type === 'VIGI') vigiCount++; else transCount++; });
    }
    const tripDays = trip.dailyLog ? trip.dailyLog.length : (trip.days || 1);
    let badges = '';
    if(trip.dailyLog) {
       if(vigiCount>0) badges += `<span class="status-badge badge-vigi" style="margin-right:4px;">${vigiCount} VIGI</span>`;
       if(transCount>0) badges += `<span class="status-badge badge-trans">${transCount} Trans</span>`;
    }
    let dateRange = trip.date;
    if(trip.endDate && trip.endDate !== trip.date) {
      dateRange = `${formatDate(trip.date)} - ${formatDate(trip.endDate)}`;
    } else {
      dateRange = formatDate(trip.date);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${trip.id} ${badges ? '<br><div style="margin-top:4px;">'+badges+'</div>' : ''}</td>
      <td><strong>${dateRange}</strong></td>
      <td>${leader ? leader.name : '?'}</td>
      <td>${assistant ? assistant.name : '?'}</td>
      <td>${getStatusBadge(trip.status)}</td>
      <td>${tripDays} d</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${originalText || '-'}</td>
      <td>
        <div class="action-btns">
          <div class="action-line">
            <button class="btn btn-secondary btn-small" title="Trocar Líder" onclick="requireAuth(() => openTradeModal(${trip.id}, 'Líder', ${leader ? leader.id : 0}))">🔄 Líder</button>
            <button class="btn btn-secondary btn-small" title="Trocar Auxiliar" onclick="requireAuth(() => openTradeModal(${trip.id}, 'Auxiliar', ${assistant ? assistant.id : 0}))">🔄 Aux</button>
          </div>
          <div class="action-line" style="margin-top: 0.2rem">
            <button class="btn btn-secondary btn-icon" title="Editar Viagem" onclick="requireAuth(() => openEditModal(${trip.id}))">✏️</button>
            <button class="btn btn-danger btn-icon" title="Excluir Viagem" onclick="requireAuth(() => deleteTrip(${trip.id}))">🗑️</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

}

// === TRADE LOGIC ===
window.openTradeModal = (tripId, role, currentUserId) => {
  if(!currentUserId) { showToast("Usuário inválido para troca.", "danger"); return; }
  tradeContext = { tripId, targetRole: role, currentUserBeingReplaced: currentUserId };
  
  const trip = state.trips.find(t => t.id === tripId);
  const currentUser = state.users.find(u => u.id === currentUserId);
  const pointsInfo = `Custo: ${trip.days || 1} ponto(s)`;
  document.getElementById('tradeTripInfo').innerHTML = `Viagem #${tripId} - ${formatDate(trip.date)}<br><small style="color: var(--warning)">${pointsInfo}</small>`;
  
  const select = document.getElementById('tradeTarget');
  select.innerHTML = '';
  const candidates = state.users.filter(u => u.role === role && u.id !== currentUserId);
  candidates.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.name;
    select.appendChild(option);
  });
  
  document.getElementById('tradeModal').showModal();
};

// === DAILY LOG UI HELPER ===
function setupDailyLogUI(startInputId, endInputId, containerId) {
  const startInput = document.getElementById(startInputId);
  const endInput = document.getElementById(endInputId);
  const container = document.getElementById(containerId);

  function renderRows() {
    container.innerHTML = '';
    const start = new Date(startInput.value);
    const end = new Date(endInput.value);
    
    // Check if dates are valid
    if(isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
       container.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Selecione datas válidas.</span>';
       return;
    }

    // JavaScript Dates are tricky with timezones, let's use a simpler approach
    let currentDate = new Date(startInput.value + 'T00:00:00');
    let endDate = new Date(endInput.value + 'T00:00:00');

    while (currentDate <= endDate) {
      const dStr = currentDate.toISOString().split('T')[0];
      const row = document.createElement('div');
      row.className = 'daily-type-row';
      row.innerHTML = `
        <span>${formatDate(dStr)}</span>
        <select class="daily-type-select" data-date="${dStr}">
          <option value="VIGI">VIGI</option>
          <option value="Transmissão">Transmissão</option>
        </select>
      `;
      container.appendChild(row);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  startInput.addEventListener('change', () => {
    if(!endInput.value || new Date(endInput.value) < new Date(startInput.value)) {
      endInput.value = startInput.value;
    }
    renderRows();
  });
  endInput.addEventListener('change', renderRows);
  
  return renderRows;
}

const renderCreateDaily = setupDailyLogUI('createStartDate', 'createEndDate', 'createDailyContainer');
const renderEditDaily = setupDailyLogUI('editStartDate', 'editEndDate', 'editDailyContainer');

window.openEditModal = (tripId) => {
  editContext = { tripId };
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  document.getElementById('editTripId').textContent = `#${tripId}`;
  document.getElementById('editStartDate').value = trip.date;
  document.getElementById('editEndDate').value = trip.endDate || trip.date;
  
  renderEditDaily();

  if(trip.dailyLog) {
    const selects = document.querySelectorAll('#editDailyContainer .daily-type-select');
    selects.forEach(sel => {
      const log = trip.dailyLog.find(d => d.date === sel.dataset.date);
      if(log) sel.value = log.type;
    });
  }

  const leaderSelect = document.getElementById('editLeader');
  leaderSelect.innerHTML = '';
  state.users.filter(u => u.role === 'Líder').forEach(l => {
    const option = document.createElement('option');
    option.value = l.id;
    option.textContent = l.name;
    if (l.id === trip.leaderId) option.selected = true;
    leaderSelect.appendChild(option);
  });

  const assistantSelect = document.getElementById('editAssistant');
  assistantSelect.innerHTML = '';
  state.users.filter(u => u.role === 'Auxiliar').forEach(a => {
    const option = document.createElement('option');
    option.value = a.id;
    option.textContent = a.name;
    if (a.id === trip.assistantId) option.selected = true;
    assistantSelect.appendChild(option);
  });

  document.getElementById('editModal').showModal();
};

window.openHistoryModal = (userId) => {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  
  document.getElementById('historyUserName').textContent = user.name + (currentMonthFilter ? ` (${currentMonthFilter})` : '');
  
  let userHistory = user.history || [];
  if (currentMonthFilter) {
    userHistory = userHistory.filter(h => h.date.startsWith(currentMonthFilter));
  }

  // Calculate points for this specific view
  let viewPoints = userHistory.reduce((acc, curr) => acc + curr.val, 0);

  document.getElementById('wppExtractBtn').onclick = () => {
    let text = `*Extrato de Viagens - ${user.name}*\n`;
    text += `*Saldo ${currentMonthFilter ? currentMonthFilter : 'Total'}:* ${viewPoints} pts\n\n`;
    
    if (userHistory.length === 0) {
      text += `Nenhuma movimentação.\n`;
    } else {
      userHistory.forEach(h => {
        const valStr = h.val > 0 ? `+${h.val}` : `${h.val}`;
        text += `📅 *${formatDate(h.date)}*\n📝 ${h.desc}\n💰 Pts: ${valStr}\n\n`;
      });
    }
    text += `_Acesse o painel para mais detalhes!_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const totalEl = document.getElementById('historyTotalPoints');
  totalEl.textContent = `${viewPoints} pts`;
  if (viewPoints > 0) {
    totalEl.className = 'score-value text-success';
  } else if (viewPoints < 0) {
    totalEl.className = 'score-value text-danger';
  } else {
    totalEl.className = 'score-value';
  }

  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';
  
  if (userHistory.length > 0) {
    userHistory.forEach(h => {
      const tr = document.createElement('tr');
      const valClass = h.val > 0 ? 'text-success' : (h.val < 0 ? 'text-danger' : '');
      const valStr = h.val > 0 ? `+${h.val}` : `${h.val}`;
      tr.innerHTML = `
        <td>${formatDate(h.date)}</td>
        <td>${h.desc}</td>
        <td class="${valClass}">${valStr}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted)">Nenhum registro encontrado.</td></tr>`;
  }
  
  document.getElementById('historyModal').showModal();
};

window.deleteTrip = (tripId) => {
  if (confirm(`Tem certeza que deseja excluir a viagem #${tripId}?`)) {
    state.trips = state.trips.filter(t => t.id !== tripId);
    showToast("Viagem excluída com sucesso!", "danger");
    fullRender();
  }
};

function fullRender() {
  saveState();
  renderLeaderboard();
  renderTeams();
  renderSchedule();
}

document.addEventListener('DOMContentLoaded', () => {
  // === AUTHENTICATION LISTENER ===
  document.getElementById('authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('authPassword').value;
    if (pass === '2258') {
      isAuthenticated = true;
      sessionStorage.setItem('isAdmin', 'true');
      document.getElementById('authModal').close();
      showToast('Acesso de administrador liberado!');
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    } else {
      showToast('Senha incorreta!', 'danger');
      document.getElementById('authPassword').value = '';
    }
  });

  // === FILTER LISTENERS ===
  document.getElementById('monthFilter').addEventListener('change', (e) => {
    currentMonthFilter = e.target.value;
    fullRender();
  });
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    document.getElementById('monthFilter').value = '';
    currentMonthFilter = '';
    fullRender();
  });

  // === EVENT LISTENERS ===
  document.getElementById('tradeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const substituteId = parseInt(document.getElementById('tradeTarget').value);
    const { tripId, targetRole } = tradeContext;
    
    const trip = state.trips.find(t => t.id === tripId);
    if (!trip) return;
    const substitute = state.users.find(u => u.id === substituteId);
    
    if (targetRole === 'Líder') {
      if(!trip.originalLeaderId) trip.originalLeaderId = trip.leaderId;
      trip.leaderId = substituteId;
      if(trip.leaderId === trip.originalLeaderId) trip.originalLeaderId = null;
    } else {
      if(!trip.originalAssistantId) trip.originalAssistantId = trip.assistantId;
      trip.assistantId = substituteId;
      if(trip.assistantId === trip.originalAssistantId) trip.originalAssistantId = null;
    }
    trip.status = `Trocado com ${substitute.name}`;
    
    document.getElementById('tradeModal').close();
    showToast("Troca realizada com sucesso!");
    fullRender();
  });

  document.getElementById('editForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const tripId = editContext.tripId;
    const trip = state.trips.find(t => t.id === tripId);
    if (!trip) return;
    
    trip.date = document.getElementById('editStartDate').value;
    trip.endDate = document.getElementById('editEndDate').value;
    
    const dailyLog = [];
    document.querySelectorAll('#editDailyContainer .daily-type-select').forEach(sel => {
      dailyLog.push({ date: sel.dataset.date, type: sel.value });
    });
    trip.dailyLog = dailyLog;
    
    const newLId = parseInt(document.getElementById('editLeader').value);
    const newAId = parseInt(document.getElementById('editAssistant').value);
    
    if(trip.leaderId !== newLId) {
       if(!trip.originalLeaderId) trip.originalLeaderId = trip.leaderId;
       trip.leaderId = newLId;
       if(trip.leaderId === trip.originalLeaderId) trip.originalLeaderId = null;
    }
    if(trip.assistantId !== newAId) {
       if(!trip.originalAssistantId) trip.originalAssistantId = trip.assistantId;
       trip.assistantId = newAId;
       if(trip.assistantId === trip.originalAssistantId) trip.originalAssistantId = null;
    }

    if(trip.leaderId !== newLId || trip.assistantId !== newAId) {
       trip.status = "Editado / Trocado";
    }

    document.getElementById('editModal').close();
    showToast("Viagem atualizada com sucesso!");
    fullRender();
  });

  document.getElementById('addTripBtn').addEventListener('click', () => {
    requireAuth(() => {
      const leaders = state.users.filter(u => u.role === 'Líder');
      const assistants = state.users.filter(u => u.role === 'Auxiliar');
      
      let lastOrigLId = null, lastOrigAId = null;
      if(state.trips.length > 0) {
        const lastT = state.trips[state.trips.length - 1];
        lastOrigLId = lastT.originalLeaderId || lastT.leaderId;
        lastOrigAId = lastT.originalAssistantId || lastT.assistantId;
      }
      
      if (lastOrigLId) nextLeaderIndex = leaders.findIndex(l => l.id === lastOrigLId) + 1;
      if (lastOrigAId) nextAssistantIndex = assistants.findIndex(a => a.id === lastOrigAId) + 1;

      const nextL = leaders[nextLeaderIndex % leaders.length];
      const nextA = assistants[nextAssistantIndex % assistants.length];
      
      createContext.expectedLeaderId = nextL.id;
      createContext.expectedAssistantId = nextA.id;
      
      let dateStr = '';
      if(state.trips.length > 0) {
        const lastTrip = state.trips[state.trips.length - 1];
        const parts = (lastTrip.endDate || lastTrip.date).split('-');
        if(parts.length === 3) {
          let [yy, mm, dd] = parts;
          let d = new Date(`${yy}-${mm}-${dd}T00:00:00`);
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().split('T')[0];
        }
      } else {
        dateStr = new Date().toISOString().split('T')[0];
      }
      
      document.getElementById('createStartDate').value = dateStr;
      document.getElementById('createEndDate').value = dateStr;
      renderCreateDaily();

      const leaderSelect = document.getElementById('createLeader');
      leaderSelect.innerHTML = '';
      leaders.forEach(l => {
        const option = document.createElement('option');
        option.value = l.id;
        option.textContent = l.name;
        if (l.id === nextL.id) option.selected = true;
        leaderSelect.appendChild(option);
      });

      const assistantSelect = document.getElementById('createAssistant');
      assistantSelect.innerHTML = '';
      assistants.forEach(a => {
        const option = document.createElement('option');
        option.value = a.id;
        option.textContent = a.name;
        if (a.id === nextA.id) option.selected = true;
        assistantSelect.appendChild(option);
      });
      
      document.getElementById('createTripModal').showModal();
    });
  });

  document.getElementById('createTripForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const startDate = document.getElementById('createStartDate').value;
    const endDate = document.getElementById('createEndDate').value;
    
    const dailyLog = [];
    document.querySelectorAll('#createDailyContainer .daily-type-select').forEach(sel => {
      dailyLog.push({ date: sel.dataset.date, type: sel.value });
    });

    const newId = state.trips.length > 0 ? Math.max(...state.trips.map(t=>t.id)) + 1 : 1;
    
    const selectedLeaderId = parseInt(document.getElementById('createLeader').value);
    const selectedAssistantId = parseInt(document.getElementById('createAssistant').value);

    let originalLeaderId = null;
    let originalAssistantId = null;
    let status = 'Confirmado';

    if (selectedLeaderId !== createContext.expectedLeaderId) {
      originalLeaderId = createContext.expectedLeaderId;
      status = 'Criado com Troca';
    }
    if (selectedAssistantId !== createContext.expectedAssistantId) {
      originalAssistantId = createContext.expectedAssistantId;
      status = 'Criado com Troca';
    }

    state.trips.push({
      id: newId, date: startDate, endDate: endDate,
      leaderId: selectedLeaderId, 
      assistantId: selectedAssistantId,
      status: status,
      dailyLog: dailyLog,
      originalLeaderId: originalLeaderId, 
      originalAssistantId: originalAssistantId
    });
    
    document.getElementById('createTripModal').close();
    showToast("Nova viagem gerada!");
    fullRender();
  });

  document.getElementById('commissionBtn').addEventListener('click', () => {
    const tbody = document.getElementById('commissionBody');
    tbody.innerHTML = '';
    
    const commissionData = {};
    state.users.forEach(u => commissionData[u.id] = { name: u.name, vigi: 0, trans: 0, total: 0 });

    const tripsToProcess = currentMonthFilter 
      ? state.trips.filter(t => t.date.startsWith(currentMonthFilter))
      : state.trips;

    tripsToProcess.forEach(trip => {
       if(!trip.dailyLog) return;
       const lId = trip.leaderId;
       const aId = trip.assistantId;
       trip.dailyLog.forEach(d => {
         if (commissionData[lId]) {
           commissionData[lId].total++;
           if (d.type === 'VIGI') commissionData[lId].vigi++; else commissionData[lId].trans++;
         }
         if (commissionData[aId]) {
           commissionData[aId].total++;
           if (d.type === 'VIGI') commissionData[aId].vigi++; else commissionData[aId].trans++;
         }
       });
    });

    Object.values(commissionData).sort((a,b) => b.total - a.total).forEach(data => {
      if (data.total === 0) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.name}</strong></td>
        <td>${data.total} d</td>
        <td><span class="status-badge badge-vigi">${data.vigi}</span></td>
        <td><span class="status-badge badge-trans">${data.trans}</span></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('commissionModal').showModal();
  });

  document.getElementById('exportPdfBtn').addEventListener('click', () => {
    // Ensure points and history are up to date
    calculatePoints();
    
    const container = document.getElementById('detailedReportBody');
    container.innerHTML = '';
    
    // 1. Resumo de Comissões
    const commissionData = {};
    state.users.forEach(u => commissionData[u.id] = { name: u.name, vigi: 0, trans: 0, total: 0 });

    const tripsToProcess = currentMonthFilter 
      ? state.trips.filter(t => t.date.startsWith(currentMonthFilter))
      : state.trips;

    tripsToProcess.forEach(trip => {
       if(!trip.dailyLog) return;
       const lId = trip.leaderId;
       const aId = trip.assistantId;
       trip.dailyLog.forEach(d => {
         if (commissionData[lId]) {
           commissionData[lId].total++;
           if (d.type === 'VIGI') commissionData[lId].vigi++; else commissionData[lId].trans++;
         }
         if (commissionData[aId]) {
           commissionData[aId].total++;
           if (d.type === 'VIGI') commissionData[aId].vigi++; else commissionData[aId].trans++;
         }
       });
    });

    const monthText = currentMonthFilter ? `(Mês: ${currentMonthFilter})` : '(Todos os Meses)';
    let html = `<h3 style="color:var(--primary); margin-bottom:1rem; margin-top:0.5rem">Resumo de Comissões ${monthText}</h3>
      <table class="history-table" style="margin-bottom: 2rem;">
        <thead>
          <tr>
            <th>Técnico</th>
            <th>Total Dias</th>
            <th>VIGI</th>
            <th>Transmissão</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    Object.values(commissionData).sort((a,b) => b.total - a.total).forEach(data => {
      if (data.total === 0) return;
      html += `<tr>
        <td><strong>${data.name}</strong></td>
        <td>${data.total} d</td>
        <td><span class="status-badge badge-vigi">${data.vigi}</span></td>
        <td><span class="status-badge badge-trans">${data.trans}</span></td>
      </tr>`;
    });
    html += `</tbody></table>`;

    // 2. Detalhamento por Técnico
    html += `<h3 style="color:var(--primary); margin-bottom:1rem;">Detalhamento por Técnico ${monthText}</h3>`;
    
    state.users.forEach(u => {
      let filteredHistory = u.history || [];
      if (currentMonthFilter) {
        filteredHistory = filteredHistory.filter(h => h.date.startsWith(currentMonthFilter));
      }
      if (filteredHistory.length === 0) return;

      let viewPoints = filteredHistory.reduce((acc, curr) => acc + curr.val, 0);

      html += `<div style="margin-bottom: 2rem; border-left: 4px solid var(--primary); padding-left: 1rem;">
        <h4 style="margin-bottom: 0.5rem; color: var(--text-main); font-size: 1.1rem">${u.name} <span style="font-size:0.9rem; color:var(--text-muted)">(Saldo no Mês: ${viewPoints} pts)</span></h4>
        <table class="history-table">
          <thead>
            <tr><th>Data</th><th>Descrição (Serviços e Trocas)</th><th>Pts</th></tr>
          </thead>
          <tbody>
      `;
      filteredHistory.forEach(h => {
        const valClass = h.val > 0 ? 'text-success' : (h.val < 0 ? 'text-danger' : '');
        const valStr = h.val > 0 ? `+${h.val}` : `${h.val}`;
        html += `<tr>
          <td style="width: 100px">${formatDate(h.date)}</td>
          <td>${h.desc}</td>
          <td class="${valClass}" style="width: 60px; text-align: right">${valStr}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });

    container.innerHTML = html;
    document.getElementById('detailedReportModal').showModal();
  });

  fullRender();
});
