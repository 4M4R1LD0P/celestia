// --- CONFIGURAÇÃO (Substitua por suas chaves reais) ---
const GEMINI_API_KEY = 'AIzaSyCcFi-vMO0kj0zrqPuogp86f09oQvu34Ao';
const GEMINI_MODEL = 'gemini-2.5-flash';

// --- CONFIGURAÇÃO DA API DA NASA ---
// O endpoint para buscar citações na OpenAPI do NTRS
const NASA_NTRS_ENDPOINT = 'https://ntrs.nasa.gov/api/citations/search';

// Função principal disparada pelo botão
async function iniciarBusca() {
    const userInput = document.getElementById('userInput').value.trim();
    const statusElement = document.getElementById('status');
    const resultsBody = document.getElementById('resultsBody');
    
    // Limpar resultados e status
    resultsBody.innerHTML = '';
    statusElement.textContent = 'Aguardando busca...';

    if (!userInput) {
        statusElement.textContent = 'Por favor, digite um termo de busca.';
        return;
    }

    try {
        // Passo 1: Traduzir a busca com o Gemini
        statusElement.textContent = 'Passo 1/2: Usando IA para traduzir a sua busca ao formato NTRS...';
        const queryEstruturada = await traduzirBusca(userInput);
        
        // Passo 2: Buscar dados na API da NASA
        statusElement.textContent = `Passo 2/2: Buscando na NASA NTRS com  a query: "${queryEstruturada}"...`;
        await buscarRelatoriosNASA(queryEstruturada);

        statusElement.textContent = 'Busca concluída!';
    } catch (error) {
        console.error('Erro na busca principal:', error);
        statusElement.innerHTML = `<span class="error">Erro: ${error.message}</span>. Verifique a console para detalhes.`;
    }
}

/**
 * Chama o Gemini para converter o texto em linguagem natural para uma query otimizada em inglês.
 * @param {string} textoBusca - A entrada de texto do usuário (ex: "documentos referentes a missão a lua").
 * @returns {Promise<string>} A query estruturada para o NTRS (ex: "lunar mission" OR "apollo program").
 */
async function traduzirBusca(textoBusca) {
    const prompt = `Você é um tradutor de linguagem natural para a API de Busca do NTRS (NASA Technical Reports Server). Sua única tarefa é analisar a solicitação de busca do usuário e transformá-la em uma query de busca otimizada para o campo 'q' do NTRS.

REGRAS:
1.  Formato de Saída: Retorne SOMENTE a string de busca, sem qualquer explicação, introdução ou texto adicional.
2.  Otimização: Use operadores booleanos (AND, OR, NOT) e aspas duplas (") para frases exatas, quando apropriado, para refinar a busca.
3.  Idioma: A query de busca DEVE estar em **inglês**, pois os documentos e metadados do NTRS estão predominantemente em inglês.

A solicitação do usuário é: ${textoBusca}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await axios.post(url, {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });
        
        // Extrai a string de busca (o texto gerado pelo Gemini)
        return response.data.candidates[0].content.parts[0].text.trim();

    } catch (error) {
        console.error("Erro ao chamar a API Gemini:", error);
        throw new Error("Falha ao traduzir a busca. Verifique sua chave API Gemini e a console.");
    }
}

// O PROXY PÚBLICO para contornar o CORS.
// ATENÇÃO: Use com cautela e por sua conta e risco, pois é um serviço de terceiros.
const CORS_PROXY = 'https://api.allorigins.win/get?url='; 


/**
 * Busca relatórios USANDO UM PROXY CORS PÚBLICO para contornar o bloqueio do navegador.
 * @param {string} queryEstruturada - A query gerada pelo Gemini.
 */
async function buscarRelatoriosNASA(queryEstruturada) {
    // 1. Constrói a URL final da NASA NTRS
    const nasaUrlFinal = `${NASA_NTRS_ENDPOINT}?q=${queryEstruturada}&limit=50`;

    console.log ("Log ->" + nasaUrlFinal);
    // 2. CODIFICA A URL DA NASA INTEIRA e prefixa com o proxy.
    // O proxy espera que a URL de destino esteja como parâmetro e codificada.
    const urlBuscaComProxy = CORS_PROXY + encodeURIComponent(nasaUrlFinal);

    try {
        const response = await axios.get(urlBuscaComProxy);
        
        // 1. EXTRAI A STRING JSON DA NASA DO JSON DO PROXY
        const nasaJsonString = response.data.contents; 
        
        if (!nasaJsonString) {
            // Se o proxy retornar algo, mas sem o campo 'contents', é um erro de proxy.
             throw new Error("O proxy não retornou o conteúdo esperado da NASA.");
        }

        // 2. CONVERTE A STRING JSON DA NASA PARA UM OBJETO JAVASCRIPT
        const nasaResponse = JSON.parse(nasaJsonString); 

        // 3. ACESSA O CAMPO 'results' DO OBJETO REAL DA NASA
        // Usamos a sintaxe OR para garantir que, se 'results' não existir, 'data' seja um array vazio []
        const data = nasaResponse.results || []; 
        
        // **VERIFICAMOS O ARRAY**
        if (data.length === 0) {
            // NOTA: Para ter certeza, você pode checar se nasaResponse.stats.total é > 0
            document.getElementById('resultsBody').innerHTML = '<tr><td colspan="4">Nenhum documento encontrado (total: 0).</td></tr>';
            return;
        }
        
        // DEBUG: Se você quiser ver os dados que estão sendo passados:
        console.log("Resultados da NASA para exibição:", data);

        renderizarResultados(data); // Chama sua função de exibição
    } catch (error) {
        console.error("Erro ao buscar na API da NASA via Proxy:", error.response ? error.response.data : error.message);
        throw new Error("Falha na busca. O Proxy CORS pode estar offline ou a NASA bloqueou a requisição do Proxy.");
    }
}

/**
 * Cria as linhas da tabela com os dados do NTRS.
 * @param {Array<Object>} documentos - Array de objetos de documento retornados pela NASA.
 */
function renderizarResultados(documentos) {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = ''; // Limpa resultados anteriores

    documentos.forEach(doc => {
        
        // --- EXTRAÇÃO DE DADOS CORRIGIDA ---
        
        // 1. Prioriza o distributionDate (mais comum e preciso)
        const rawDate = doc.distributionDate 
                        // 2. Fallback para submittedDate (quando o documento foi enviado)
                        ?? doc.submittedDate 
                        // 3. Fallback para a data de criação do registro
                        ?? doc.created; 
        
        // Se alguma data foi encontrada, extrai apenas a parte YYYY-MM-DD
        const data = rawDate ? rawDate.substring(0, 10) : 'N/A';


        // Extrai Título, Resumo e Link (mantidos do código anterior)
        const titulo = doc.title ?? 'N/A';
        const resumo = doc.abstract 
            ?? (doc.description ? doc.description.substring(0, 150) + '...' : 'Sem resumo.');
        
        const pdfLinkPart = doc.downloads?.[0]?.links?.pdf 
                         ?? doc.downloads?.[0]?.links?.original;
        const linkCompleto = pdfLinkPart 
            ? `https://ntrs.nasa.gov${pdfLinkPart}` 
            : `https://ntrs.nasa.gov/citations/${doc.id}`; 
        
        // --- INSERÇÃO NA TABELA ---
        const row = resultsBody.insertRow();
        row.insertCell().innerHTML = titulo;
        row.insertCell().textContent = data; // AGORA DEVE MOSTRAR A DATA CORRETA
        row.insertCell().textContent = resumo;
        row.insertCell().innerHTML = `<a href="${linkCompleto}" target="_blank">Ver Documento</a>`;
    });
}