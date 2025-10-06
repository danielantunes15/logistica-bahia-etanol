import { fetchTable } from './api.js';
import { showToast } from './helpers.js';

let workHoursChart = null;

export async function renderReports() {
    try {
        const historico = await fetchTable('caminhao_historico', '*, caminhoes(cod_equipamento)');
        const workHours = calculateWorkHours(historico);
        
        const labels = workHours.map(item => item.cod_equipamento);
        const data = workHours.map(item => item.totalHours);

        drawWorkHoursChart(labels, data);
    } catch (error) {
        showToast('Erro ao carregar dados do relatório', 'error');
        console.error("Erro em renderReports:", error);
    }
}

function calculateWorkHours(history) {
    const workLogs = {};
    const productiveStatus = ['ativo', 'em_viagem'];

    history.forEach(log => {
        const id = log.caminhao_id;
        if (!id || !log.caminhoes) return;
        if (!workLogs[id]) {
            workLogs[id] = { cod_equipamento: log.caminhoes.cod_equipamento, sessions: [] };
        }
        workLogs[id].sessions.push({ status: log.status_novo, time: new Date(log.timestamp_mudanca) });
    });

    const results = [];
    for (const id in workLogs) {
        let totalMillis = 0;
        const sessions = workLogs[id].sessions.sort((a, b) => a.time - b.time);
        
        for(let i = 0; i < sessions.length - 1; i++) {
            if (productiveStatus.includes(sessions[i].status)) {
                const startTime = sessions[i].time;
                const endTime = sessions[i+1].time;
                totalMillis += endTime - startTime;
            }
        }
        
        const lastSession = sessions[sessions.length - 1];
        if (lastSession && productiveStatus.includes(lastSession.status)) {
            const startTime = lastSession.time;
            const endTime = new Date();
            totalMillis += endTime - startTime;
        }

        results.push({
            caminhao_id: id,
            cod_equipamento: workLogs[id].cod_equipamento,
            totalHours: totalMillis / (1000 * 60 * 60)
        });
    }
    return results;
}

function drawWorkHoursChart(labels, data) {
    const ctx = document.getElementById('workHoursChart');
    if (!ctx) return;
    if (workHoursChart) workHoursChart.destroy();
    workHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Horas Trabalhadas (ativo/em viagem)',
                data: data,
                backgroundColor: 'rgba(56, 161, 105, 0.6)',
                borderColor: 'rgba(56, 161, 105, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { color: '#A0AEC0' }, grid: { color: '#4A5568' } }, x: { ticks: { color: '#A0AEC0' }, grid: { color: '#4A5568' } } },
            plugins: { legend: { labels: { color: '#F7FAFC' } } }
        }
    });
}