// js/views/tempo.js
import { showToast, showLoading, hideLoading } from '../helpers.js';
import { dataCache } from '../dataCache.js'; // NOVO: Importar dataCache

// OpenWeatherMap API Key
// MUDANÇA: A chave hardcoded foi removida e é carregada via objeto global window.env
const API_KEY = window.env.OPENWEATHER_API_KEY;

// MUDANÇA: Lista fixa de locais agora é um fallback e ponto de partida
const FIXED_LOCATIONS = [
    { name: 'Usina Bahia Etanol', type: 'city', lat: -17.6423, lon: -40.1815 },
    { name: 'Lajedão-BA', type: 'city', lat: -17.6138, lon: -40.345 },
    { name: 'Nanuque-MG', type: 'city', lat: -17.8389, lon: -40.3539 },
    { name: 'S. Aimorés-MG', type: 'city', lat: -17.7828, lon: -40.2477 } // Serra dos Aimorés
];

// Helper para converter UNIX timestamp para BRT HH:MM
const getLocalTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const d = new Date(timestamp * 1000);
    const options = {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return d.toLocaleTimeString('pt-BR', options);
};

// Helper: Ponto de Orvalho (Td)
const calculateDewPoint = (T, RH) => {
    // Fórmula de aproximação (precisão aceitável para aplicações operacionais)
    const a = 17.27;
    const b = 237.7;
    const alpha = a * T / (b + T) + Math.log(RH / 100);
    const Td = b * alpha / (a - alpha);
    return Math.round(Td);
};

// Helper: Risco de Pulverização (CRITÉRIOS: Vento > 15 km/h OU Umidade < 55%)
const getSprayingRisk = (windKmh, humidity) => {
    if (windKmh > 15 || humidity < 55) {
        return { status: 'NÃO APLICAR', color: 'risk-danger' };
    }
    if (windKmh > 10) {
        return { status: 'ATENÇÃO', color: 'risk-warning' };
    }
    return { status: 'IDEAL', color: 'risk-success' };
};

// Helper: Média do vento (5 dias)
const calculateAverageWind = (forecastList) => {
    if (!forecastList || forecastList.length === 0) return 'N/A';
    
    let totalSpeedMps = 0;
    let count = 0;
    
    for (let i = 0; i < Math.min(40, forecastList.length); i++) {
        totalSpeedMps += forecastList[i].wind.speed;
        count++;
    }
    
    const averageMps = totalSpeedMps / count;
    const averageKmh = averageMps * 3.6;
    return averageKmh.toFixed(1);
};


export class TempoView {
    constructor() {
        this.container = null;
        this.weatherData = [];
        this.locationsToMonitor = []; // NOVO: Lista dinâmica de locais para monitorar
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Nada a fazer
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#tempo-view');
    }

    getHTML() {
        return `
            <div id="tempo-view" class="view active-view tempo-view">
                <div class="controle-header">
                    <h1>Previsão do Tempo</h1> <button class="btn-primary" id="refresh-tempo">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar Dados
                    </button>
                </div>
                
                <div class="weather-summary-grid" id="weather-summary-grid">
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <i class="ph-fill ph-cloud-lightning-rain" style="font-size: 3rem;"></i>
                        <p>Carregando resumos das cidades...</p>
                    </div>
                </div>
                
                <div class="weather-tables-container" id="weather-tables-container">
                    </div>
            </div>
        `;
    }

    addEventListeners() {
        document.getElementById('refresh-tempo').addEventListener('click', () => this.loadData(true));
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            // 1. Busca todos os dados cadastrais (Necessário para a nova função FazendaSummary)
            const allData = await dataCache.fetchAllData(forceRefresh);

            // 2. Monta a lista de locais APENAS com as cidades fixas
            this.locationsToMonitor = this.getDynamicLocations(allData);

            // 3. Renderiza o resumo das frentes ANTES de buscar as cidades
            // REMOVIDO: await this.renderFazendaSummary(allData);

            // 4. Faz o fetch de todos os locais (agora só cidades)
            const currentFetchPromises = this.locationsToMonitor.map(loc => 
                this.fetchWeather(loc, 'weather')
            );
            const forecastFetchPromises = this.locationsToMonitor.map(loc =>
                this.fetchWeather(loc, 'forecast')
            );

            const currentResults = await Promise.all(currentFetchPromises);
            const forecastResults = await Promise.all(forecastFetchPromises);
            
            this.weatherData = currentResults.map((current, index) => {
                const forecastList = forecastResults[index].list || []; 
                return {
                    ...current,
                    forecast: forecastList,
                    originalLocation: this.locationsToMonitor[index]
                }
            });
            
            this.renderWeatherContent();

        } catch (error) {
            console.error('Erro ao buscar dados do tempo:', error);
            showToast('Erro ao carregar dados do tempo. Tente novamente.', 'error');
        } finally {
            hideLoading();
        }
    }
    
    // MUDANÇA: Função agora retorna APENAS os locais fixos.
    getDynamicLocations(allData) {
        // Ignora frentes e retorna apenas os locais fixos
        return FIXED_LOCATIONS;
    }
    
    // REMOVIDO: O método renderFazendaSummary foi removido daqui

    // MUDANÇA: fetchWeather agora usa o nome original do objeto de localização.
    async fetchWeather(location, type = 'weather') {
        const url = `https://api.openweathermap.org/data/2.5/${type}?lat=${location.lat}&lon=${location.lon}&appid=${API_KEY}&units=metric&lang=pt_br`;
        
        const response = await fetch(url);
        if (!response.ok) {
            // Retorna um objeto que permite o tratamento de erros em loadData
            return { displayName: location.name, list: [], main: {}, wind: {}, error: `HTTP Error ${response.status}` };
        }
        const data = await response.json();
        return { ...data, displayName: location.name }; 
    }
    
    renderWeatherContent() {
        this.renderSummaryCards();
        this.renderDetailTables();
    }
    
    // 1. RENDERIZA OS CARDS DE RESUMO EM LINHA HORIZONTAL (APENAS CIDADES FIXAS)
    renderSummaryCards() {
        const gridContainer = document.getElementById('weather-summary-grid');
        if (!gridContainer) return;
        
        // MUDANÇA: Permite que a grade se ajuste automaticamente
        gridContainer.style.gridTemplateColumns = `repeat(auto-fit, minmax(280px, 1fr))`; 
        
        const cardsHTML = this.weatherData.map(cityData => {
            
            // Tratamento de Erro Básico para o Card de Resumo
            if (cityData.error || !cityData.main || cityData.forecast.length === 0) {
                 return `
                    <div class="summary-card-horizontal" style="border-color: var(--accent-danger);">
                        <h2 class="city-name-summary">${cityData.displayName}</h2>
                        <p class="fazenda-subtitle-summary" style="color: var(--accent-danger);">Dados indisponíveis</p>
                        <div class="summary-details"><p style="font-size: 0.9rem; color: var(--text-secondary);">Verifique a conexão ou a API (${cityData.error || 'Sem previsão detalhada'}).</p></div>
                    </div>
                `;
            }

            const currentWeather = cityData.main;
            const weatherDescription = cityData.weather[0];
            const iconUrl = `https://openweathermap.org/img/wn/${weatherDescription.icon}@2x.png`;
            const windSpeed = (cityData.wind.speed * 3.6).toFixed(1);
            const sunrise = getLocalTime(cityData.sys.sunrise);
            const sunset = getLocalTime(cityData.sys.sunset);
            
            // Média de vento para os próximos 5 dias
            const avgWind = calculateAverageWind(cityData.forecast);
            
            // Título (apenas o nome da cidade fixa)
            let cardTitle = cityData.displayName;
            
            return `
                <div class="summary-card-horizontal">
                    <h2 class="city-name-summary">${cardTitle}</h2>
                    
                    <div class="summary-details">
                        <div class="summary-temp-block">
                            <img src="${iconUrl}" class="icon-summary">
                            <span class="temp-summary">${Math.round(currentWeather.temp)}°C</span>
                        </div>
                        <div class="summary-info-right">
                            <span class="desc-summary">${weatherDescription.description.charAt(0).toUpperCase() + weatherDescription.description.slice(1)}</span>
                            <span class="minmax-summary">Máx: ${Math.round(currentWeather.temp_max)}°C | Mín: ${Math.round(currentWeather.temp_min)}°C</span>
                            
                            <div class="details-min">
                                <span class="wind-summary"><i class="ph-fill ph-wind"></i> Vento Médio (5D): ${avgWind} km/h</span>
                            </div>
                            
                            <div class="sun-times">
                                <span><i class="ph-fill ph-sun"></i> Nascer: ${sunrise}</span>
                                <span><i class="ph-fill ph-moon"></i> Pôr: ${sunset}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        gridContainer.innerHTML = cardsHTML;
    }
    
    // 2. RENDERIZA AS TABELAS DETALHADAS ABAIXO DO RESUMO (APENAS CIDADES FIXAS)
    renderDetailTables() {
        const tablesContainer = document.getElementById('weather-tables-container');
        if (!tablesContainer) return;
        
        let tablesHTML = '';
        
        this.weatherData.forEach(cityData => {
            // Apenas renderiza detalhes se for uma cidade FIXA e houver dados de previsão
            const isTargetLocation = cityData.originalLocation.type === 'city';
            
            if (isTargetLocation && cityData.forecast.length > 0) {

                const cityTitle = cityData.displayName;
                const hourlyForecast = cityData.forecast.slice(0, 8); // Próximas 24h
                const hourlyChart = this.drawHourlyChart(cityData.originalLocation.name, cityData.originalLocation.type, hourlyForecast); // Gera o HTML do gráfico
                const hourlyTableHTML = this.generateHourlyTable(hourlyForecast); // Gera o HTML da tabela
                
                const dailyTable = this.generateDailyTable(cityData.forecast); // Próximos 5 dias
                
                tablesHTML += `
                    <div class="city-tables-block">
                        <h2 class="city-tables-title">${cityTitle}: Previsão Detalhada</h2>
                        
                        <div class="table-group-wrapper">
                            <div class="hourly-decision-block">
                                ${hourlyChart} 
                                ${hourlyTableHTML}
                            </div>
                            ${dailyTable}
                        </div>
                    </div>
                `;
            }
        });
        
        tablesContainer.innerHTML = tablesHTML;
        
        // Destrói e redesenha o gráfico APÓS a injeção do HTML
        this.weatherData.forEach(cityData => {
            const isTargetLocation = cityData.originalLocation.type === 'city';

            if (isTargetLocation && cityData.forecast.length > 0) {
                this.initializeChart(cityData.originalLocation.name, cityData.originalLocation.type, cityData.forecast.slice(0, 8));
            }
        });
    }

    // NOVO: Adiciona a função para criar o HTML do Canvas
    drawHourlyChart(cityName, type, forecastList) {
        const chartId = `hourlyChart-${type}-${cityName.replace(/\s/g, '-').replace(':', '-')}`;
        return `
            <div class="forecast-table-wrapper table-hourly-chart">
                <h3 class="table-title" style="color: var(--accent-primary);">Tendência Horária (Temperatura & Chuva)</h3>
                <div style="height: 250px; padding: 10px;">
                    <canvas id="${chartId}" style="width: 100%; height: 100%;"></canvas>
                </div>
            </div>
        `;
    }

    // NOVO: Adiciona a função para inicializar o gráfico (chamada APÓS o render)
    initializeChart(cityName, type, forecastList) {
        const chartId = `hourlyChart-${type}-${cityName.replace(/\s/g, '-').replace(':', '-')}`;
        const ctx = document.getElementById(chartId);
        if (!ctx) return;
        
        const labels = forecastList.map(f => new Date(f.dt * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        const tempDataset = forecastList.map(f => f.main.temp);
        const popDataset = forecastList.map(f => f.pop * 100);
        
        // Destrói o gráfico anterior (se existir)
        if (ctx.chart) {
            ctx.chart.destroy();
        }

        ctx.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Temperatura (°C)',
                        data: tempDataset,
                        borderColor: 'rgba(237, 137, 54, 1)', // Laranja
                        backgroundColor: 'rgba(237, 137, 54, 0.2)',
                        yAxisID: 'y',
                        tension: 0.3,
                        fill: false,
                    },
                    {
                        label: 'Prob. Chuva (%)',
                        data: popDataset,
                        borderColor: 'rgba(43, 108, 176, 1)', // Azul
                        backgroundColor: 'rgba(43, 108, 176, 0.4)',
                        yAxisID: 'y1',
                        tension: 0.3,
                        fill: true,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Temp. (°C)', color: '#F7FAFC' },
                        ticks: { color: '#A0AEC0' },
                        grid: { color: '#4A5568' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Chuva (%)', color: '#F7FAFC' },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        max: 100,
                        ticks: { color: '#A0AEC0' }
                    },
                    x: {
                        ticks: { color: '#A0AEC0' },
                        grid: { color: '#4A5568' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#F7FAFC' } }
                }
            }
        });
    }
    
    // GERA TABELA HORÁRIA (24H)
    generateHourlyTable(forecastList) {
        
        // CORREÇÃO: Garante que forecastList tem dados antes de mapear
        if (!forecastList || forecastList.length === 0) {
            return `
                <div class="forecast-table-wrapper table-24h">
                    <h3 class="table-title">Próximas 24 Horas (Decisão Operacional)</h3>
                    <p style="padding: 20px; text-align: center; color: var(--text-secondary);">Sem dados de previsão por hora disponíveis.</p>
                </div>
            `;
        }

        const rowsHTML = forecastList.map(f => {
            
            // Proteção contra logs incompletos da API (embora o fallback deva ter evitado isso)
            if (!f.weather || f.weather.length === 0 || !f.main) return '';

            const time = new Date(f.dt * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const temp = f.main.temp;
            const humidity = f.main.humidity;
            const windKmh = (f.wind.speed * 3.6);
            const pop = Math.round(f.pop * 100);
            
            // Novos Indicadores
            const dewPoint = calculateDewPoint(temp, humidity);
            const risk = getSprayingRisk(windKmh, humidity);

            const description = f.weather[0].description;
            const icon = f.weather[0].icon;
            
            // FORMATO CLARO: CHUVA + %
            const popDisplay = `<i class="ph-fill ph-drop"></i> ${pop}%`;

            return `
                <tr>
                    <td>${time}</td>
                    <td><img src="https://openweathermap.org/img/wn/${icon}.png" class="table-icon"> ${description.charAt(0).toUpperCase() + description.slice(1)}</td>
                    <td><strong>${Math.round(temp)}°C</strong></td>
                    <td>${Math.round(windKmh)} km/h</td>
                    <td>${humidity}%</td>
                    <td>${popDisplay}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="forecast-table-wrapper table-24h">
                <h3 class="table-title">Próximas 24 Horas (Decisão Operacional)</h3>
                <table class="data-table-modern table-hourly">
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Condição</th>
                            <th>Temp.</th>
                            <th>Vento</th>
                            <th>Umidade</th>
                            <th>Prob. Chuva</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    // GERA TABELA DIÁRIA (5 DIAS)
    generateDailyTable(forecastList) {
        
        // CORREÇÃO: Garante que forecastList tem dados antes de extrair
        if (!forecastList || forecastList.length === 0) {
            return `
                <div class="forecast-table-wrapper table-5day">
                    <h3 class="table-title">Próximos 5 Dias</h3>
                    <p style="padding: 20px; text-align: center; color: var(--text-secondary);">Sem dados de previsão por 5 dias disponíveis.</p>
                </div>
            `;
        }

        const dailyForecasts = this.extractDailyForecast(forecastList);
        
        const rowsHTML = dailyForecasts.map((daily, index) => {
            // Proteção contra logs incompletos da API
            if (!daily.weather || daily.weather.length === 0 || !daily.main) return '';

            const date = new Date(daily.dt * 1000).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
            const maxTemp = Math.round(daily.main.temp_max);
            const minTemp = Math.round(daily.main.temp_min);
            const icon = daily.weather[0].icon;
            const description = daily.weather[0].description;
            const humidity = daily.main.humidity;
            const pop = Math.round(daily.pop * 100); 
            const windSpeed = (daily.wind.speed * 3.6).toFixed(1);
            
            // FORMATO CLARO: CHUVA + %
            const popDisplay = `<i class="ph-fill ph-drop"></i> ${pop}%`;


            return `
                <tr>
                    <td><strong>${index === 0 ? 'Hoje' : date.split(' ')[0]}</strong></td>
                    <td><img src="https://openweathermap.org/img/wn/${icon}.png" class="table-icon"> ${description.charAt(0).toUpperCase() + description.slice(1)}</td>
                    <td><span class="daily-max">${maxTemp}°</span> / <span class="daily-min">${minTemp}°</span></td>
                    <td>${popDisplay}</td>
                    <td>${humidity}%</td>
                    <td>${windSpeed} km/h</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="forecast-table-wrapper table-5day">
                <h3 class="table-title">Próximos 5 Dias</h3>
                <table class="data-table-modern table-daily">
                    <thead>
                        <tr>
                            <th>Dia</th>
                            <th>Condição</th>
                            <th>Máx/Mín</th>
                            <th>Prob. Chuva</th>
                            <th>Umidade</th>
                            <th>Vento</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // MÉTODO AUXILIAR PARA PREVISÃO DIÁRIA (MANTIDO)
    extractDailyForecast(forecastList) {
        const dailyForecasts = [];
        const seenDays = new Set();
        
        for (const item of forecastList) {
            const date = new Date(item.dt * 1000);
            const dayKey = date.toISOString().split('T')[0];
            
            if (!seenDays.has(dayKey) && date.getHours() >= 11 && date.getHours() <= 14) {
                dailyForecasts.push(item);
                seenDays.add(dayKey);
            }
        }
        
        return dailyForecasts.slice(0, 5);
    }
}