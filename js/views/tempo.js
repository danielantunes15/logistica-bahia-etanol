// js/views/tempo.js
import { showToast, showLoading, hideLoading } from '../helpers.js';

// OpenWeatherMap API Key
const API_KEY = 'fdcb3d82c679c196a11975457733c8d6';

// Cidades a serem monitoradas com as coordenadas (Ibirapuã removida e Usina renomeada)
const CITIES_TO_MONITOR = [
    { name: 'Bahia Etanol', lat: -17.6423, lon: -40.1815 },
    { name: 'Lajedão-BA', lat: -17.6138, lon: -40.345 },
    { name: 'Nanuque-MG', lat: -17.8389, lon: -40.3539 },
    { name: 'S. Aimorés-MG', lat: -17.7828, lon: -40.2477 } // Serra dos Aimorés
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
            const currentFetchPromises = CITIES_TO_MONITOR.map(city => 
                this.fetchWeather(city, 'weather')
            );
            const forecastFetchPromises = CITIES_TO_MONITOR.map(city =>
                this.fetchWeather(city, 'forecast')
            );

            const currentResults = await Promise.all(currentFetchPromises);
            const forecastResults = await Promise.all(forecastFetchPromises);
            
            this.weatherData = currentResults.map((current, index) => ({
                ...current,
                forecast: forecastResults[index].list
            }));
            
            this.renderWeatherContent();

        } catch (error) {
            console.error('Erro ao buscar dados do tempo:', error);
            showToast('Erro ao carregar dados do tempo. Tente novamente.', 'error');
        } finally {
            hideLoading();
        }
    }
    
    async fetchWeather(city, type = 'weather') {
        const url = `https://api.openweathermap.org/data/2.5/${type}?lat=${city.lat}&lon=${city.lon}&appid=${API_KEY}&units=metric&lang=pt_br`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Falha ao buscar ${type} para ${city.name}`);
        }
        const data = await response.json();
        return { ...data, displayName: city.name };
    }
    
    renderWeatherContent() {
        this.renderSummaryCards();
        this.renderDetailTables();
    }
    
    // 1. RENDERIZA OS CARDS DE RESUMO EM LINHA HORIZONTAL
    renderSummaryCards() {
        const gridContainer = document.getElementById('weather-summary-grid');
        if (!gridContainer) return;
        
        gridContainer.style.gridTemplateColumns = `repeat(${this.weatherData.length}, 1fr)`;
        
        const cardsHTML = this.weatherData.map(cityData => {
            const currentWeather = cityData.main;
            const weatherDescription = cityData.weather[0];
            const iconUrl = `https://openweathermap.org/img/wn/${weatherDescription.icon}@2x.png`;
            const windSpeed = (cityData.wind.speed * 3.6).toFixed(1);
            const sunrise = getLocalTime(cityData.sys.sunrise);
            const sunset = getLocalTime(cityData.sys.sunset);

            // Média de vento para os próximos 5 dias
            const avgWind = calculateAverageWind(cityData.forecast);
            
            return `
                <div class="summary-card-horizontal">
                    <h2 class="city-name-summary">${cityData.displayName}</h2>
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
    
    // 2. RENDERIZA AS TABELAS DETALHADAS ABAIXO DO RESUMO
    renderDetailTables() {
        const tablesContainer = document.getElementById('weather-tables-container');
        if (!tablesContainer) return;
        
        let tablesHTML = '';
        
        this.weatherData.forEach(cityData => {
            const cityTitle = cityData.displayName;
            const hourlyTable = this.generateHourlyTable(cityData.forecast.slice(0, 8)); // Próximas 24h
            const dailyTable = this.generateDailyTable(cityData.forecast); // Próximos 5 dias
            
            tablesHTML += `
                <div class="city-tables-block">
                    <h2 class="city-tables-title">${cityTitle}: Previsão Detalhada</h2>
                    
                    <div class="table-group-wrapper">
                        ${hourlyTable}
                        ${dailyTable}
                    </div>
                </div>
            `;
        });
        
        tablesContainer.innerHTML = tablesHTML;
    }

    // GERA TABELA HORÁRIA (24H)
    generateHourlyTable(forecastList) {
        const rowsHTML = forecastList.map(f => {
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
                    <td class="risk-cell">
                        <span class="risk-badge ${risk.color}">${risk.status}</span>
                    </td>
                    <td>${popDisplay}</td>
                    <td>${Math.round(windKmh)} km/h</td>
                    <td>${humidity}%</td>
                    <td>${dewPoint}°C</td>
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
                            <th>Risco Pulver.</th>
                            <th>Prob. Chuva</th>
                            <th>Vento</th>
                            <th>Umidade</th>
                            <th>P. Orvalho</th>
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
        const dailyForecasts = this.extractDailyForecast(forecastList);
        
        const rowsHTML = dailyForecasts.map((daily, index) => {
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