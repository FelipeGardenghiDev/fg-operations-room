# 🕹️ FGSOFT Operations Room

Sala de operações em Pixel Art 2D em tempo real para acompanhar os agentes autônomos da **FGSOFT**:
- 👨‍💻 **Juliano · Tech Lead**: Agente principal de engenharia e desenvolvimento.
- 📋 **Luis · Arquitech**: Arquiteto de sistemas, PRDs e modelagem de soluções.
- 🕵️‍♀️ **Duda · Q&A**: Auditora de qualidade, segurança e regras RLS.
- 🛡️ **Gabriel · Infra**: Guardião 24/7 de infraestrutura, uptime e estabilidade.
- 📈 **Yago · Leads**: Inteligência comercial e prospecção de clientes.
- 🤖 **Pedro · ChatBot**: Engenharia conversacional e automações de atendimento.
- 🗄️ **Gislaine · DBA**: Modelagem de dados, queries e integridade do banco.
- 🔒 **Daniel · Cybersec**: Telemetria e cibersegurança da rede residencial e servidores.
- 🧠 **J.A.R.V.I.S. · Life OS Core**: Monitor central de telemetria e status do assistente Jarvis no netbook.

Acessível 24/7 na nuvem via **GitHub Pages** e alimentado em tempo real por **Supabase Realtime WebSockets**.

---

### 🌐 Acesso Online
Abra no navegador em qualquer dispositivo:
👉 **[https://felipegardenghidev.github.io/fg-operations-room/](https://felipegardenghidev.github.io/fg-operations-room/)**

---

### 👥 Nossa Equipe Virtual
- 👨‍💻 **Juliano · Tech Lead**: Engenharia central e execução de código.
- 📋 **Luis · Arquitech**: Arquitetura técnica e especificações funcionais.
- 🕵️‍♀️ **Duda · Q&A**: Qualidade, testes automatizados e validações.
- 🛡️ **Gabriel · Infra**: Infraestrutura, observabilidade e SRE.
- 📈 **Yago · Leads**: Prospecção de oportunidades e análise de mercado.
- 🤖 **Pedro · ChatBot**: Agente conversacional e integrações.
- 🗄️ **Gislaine · DBA**: Modelagem relacional e otimização de banco de dados.
- 🔒 **Daniel · Cybersec**: Cibersegurança, telemetria de rede e proteção.
- 🧠 **J.A.R.V.I.S. · Life OS Core**: Assistente central conectado ao Netbook Ubuntu CLI.

---

## 🔑 Autenticação no Navegador (Celular / PC)

A conexão com o **Supabase Realtime** utiliza uma chave `publishable` (protegida por Row Level Security) armazenada apenas no `localStorage` do seu dispositivo:

1. Acesse o link abaixo substituindo `<SUA_CHAVE_PUBLISHABLE>` pela sua chave pública de leitura:
   ```text
   https://felipegardenghidev.github.io/fg-operations-room/#key=<SUA_CHAVE_PUBLISHABLE>
   ```
2. O sistema salva a chave automaticamente no `localStorage` do navegador e remove o parâmetro `#key=...` da barra de endereços na mesma hora. Nos acessos seguintes, a conexão ocorre automaticamente.
