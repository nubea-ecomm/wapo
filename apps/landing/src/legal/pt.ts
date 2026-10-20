import { site } from '../config'
import type { LegalCopy } from './types'

export const pt: LegalCopy = {
  updated: 'Última atualização',
  privacy: {
    title: 'Política de privacidade',
    description:
      'Como o Wapo coleta, utiliza, conserva e protege dados pessoais.',
    intro: `Esta política explica como ${site.operator} (“nós”) trata dados pessoais ao operar a instância hospedada do Wapo, uma plataforma para integrar e gerenciar comunicações do WhatsApp.`,
    sections: [
      {
        title: '1. Controlador e escopo',
        paragraphs: [
          `O controlador dos dados é ${site.operator}, com operação em ${site.location}. Para dúvidas sobre privacidade, entre em contato pelo e-mail ${site.contactEmail}.`,
          `Esta política se aplica ao site público, ao console e à API da instância do Wapo operada por ${site.operator}. O Wapo também pode ser instalado por terceiros: cada operador de uma instalação independente é responsável por suas próprias práticas e deve publicar sua própria política.`,
        ],
      },
      {
        title: '2. Dados que tratamos',
        items: [
          'Dados da conta: nome, e-mail, função, projetos atribuídos e dados de autenticação protegidos.',
          'Dados de clientes e contatos: identificadores, nome, telefone, e-mail, preferências de marketing e propriedades adicionadas por usuários autorizados.',
          'Comunicações: conteúdo, arquivos, modelos, status e metadados de mensagens enviadas ou recebidas pelo WhatsApp.',
          'Dados de integração: identificadores de contas e números do WhatsApp Business, configuração de webhooks e credenciais criptografadas.',
          'Dados técnicos: endereço IP, identificador da solicitação, rota, data, duração, código de resposta, eventos e registros de segurança. Não armazenamos o corpo completo de cada solicitação nos registros de acesso.',
        ],
      },
      {
        title: '3. Como usamos os dados',
        items: [
          'Fornecer, manter e proteger o Wapo e suas integrações.',
          'Enviar e receber comunicações solicitadas por nossos clientes.',
          'Administrar contas, permissões, conexões, modelos e webhooks.',
          'Diagnosticar erros, prevenir abusos e manter um registro das operações.',
          'Enviar avisos operacionais e responder a solicitações de suporte.',
          'Cumprir obrigações legais e fazer valer os acordos aplicáveis.',
        ],
        paragraphs: [
          'Não vendemos dados pessoais nem os usamos para criar nossos próprios perfis publicitários.',
        ],
      },
      {
        title: '4. Papéis e bases do tratamento',
        paragraphs: [
          'Em relação aos dados das organizações que contratam ou administram o Wapo, tratamos informações para executar o serviço solicitado, proteger interesses legítimos de segurança e cumprir obrigações legais. Em relação aos contatos e destinatários adicionados por um cliente, normalmente atuamos como operador e seguimos as instruções desse cliente, que deve contar com uma base legal e os consentimentos necessários.',
        ],
      },
      {
        title: '5. Fornecedores e transferências',
        paragraphs: [
          'Compartilhamos dados somente quando necessário com fornecedores de infraestrutura, e-mail e mensagens contratados para operar o serviço, sujeitos a obrigações de confidencialidade e segurança. As comunicações do WhatsApp também são processadas pela Meta Platforms e suas empresas vinculadas, conforme seus termos e políticas.',
          'Alguns fornecedores podem processar dados fora da Argentina. Nesses casos, buscamos aplicar medidas contratuais e de segurança adequadas à legislação aplicável.',
        ],
      },
      {
        title: '6. Retenção',
        paragraphs: [
          'Conservamos os dados enquanto a conta ou o projeto permanecer ativo e pelo tempo necessário para prestar o serviço, resolver disputas e cumprir obrigações. Registros de API bem-sucedidos e tarefas concluídas são mantidos por até 30 dias; registros de auditoria e entregas com falha, por até 90 dias. Mensagens, contatos e outros dados operacionais permanecem até que o cliente os exclua, encerre o serviço ou solicite sua eliminação, salvo quando a retenção for exigida por lei.',
        ],
      },
      {
        title: '7. Segurança',
        paragraphs: [
          'Aplicamos controles técnicos e organizacionais razoáveis, incluindo criptografia de credenciais, conexões HTTPS em produção, permissões por função, isolamento entre projetos, sessões revogáveis e registros de auditoria. Nenhum sistema é completamente infalível; se detectarmos um incidente relevante, agiremos e notificaremos conforme a legislação aplicável.',
        ],
      },
      {
        title: '8. Seus direitos',
        paragraphs: [
          `Você pode solicitar acesso, atualização, correção ou eliminação dos seus dados, ou consultar sobre o tratamento, enviando um e-mail para ${site.contactEmail}. Podemos precisar verificar sua identidade e, quando os dados tiverem sido adicionados por uma organização cliente, encaminhar a solicitação a essa organização.`,
          'Você também pode seguir nossas instruções de exclusão de dados. Na Argentina, a Agência de Acesso à Informação Pública é a autoridade responsável pela Lei 25.326 e recebe denúncias e reclamações.',
        ],
      },
      {
        title: '9. Cookies e análise de uso',
        paragraphs: [
          'Esta landing page não instala cookies publicitários nem ferramentas de análise de terceiros. O console pode usar o armazenamento do navegador para manter uma sessão iniciada e lembrar preferências da interface. Se incorporarmos tecnologias não essenciais, atualizaremos esta política e solicitaremos o consentimento correspondente.',
        ],
      },
      {
        title: '10. Alterações e contato',
        paragraphs: [
          'Podemos atualizar esta política para refletir mudanças legais, técnicas ou do serviço. Publicaremos a nova data nesta página e notificaremos alterações substanciais quando apropriado.',
        ],
      },
    ],
    contact: 'DÚVIDAS SOBRE PRIVACIDADE',
    deletionLink: 'Instruções de exclusão de dados',
  },
  deletion: {
    title: 'Excluir meus dados',
    description:
      'Instruções para solicitar a exclusão de dados pessoais do Wapo.',
    eyebrow: 'CONTROLE DE DADOS',
    note: 'Solicitação gratuita por e-mail',
    intro: `Você pode solicitar a exclusão dos dados associados à sua conta ou à sua interação com uma organização que utiliza a instância do Wapo operada por ${site.operator}.`,
    instructions: 'Como fazer a solicitação',
    subject: 'Solicitação de exclusão de dados | Wapo',
    emailLead: 'Envie um e-mail para',
    emailTail: 'com o assunto',
    steps: [
      { title: 'Entre em contato', body: '' },
      {
        title: 'Identifique os dados',
        body: 'Informe o e-mail ou telefone relacionado, a organização com a qual você interagiu e quais informações deseja excluir. Não envie senhas, códigos ou tokens.',
      },
      {
        title: 'Verificamos e respondemos',
        body: 'Podemos solicitar informações limitadas para verificar sua identidade. Confirmaremos o recebimento e responderemos dentro do prazo exigido pela legislação aplicável.',
      },
    ],
    sections: [
      {
        title: 'O que acontece depois',
        paragraphs: [
          'Excluiremos ou anonimizaremos os dados que controlamos, exceto aqueles que precisamos conservar para cumprir uma obrigação legal, proteger a segurança ou resolver uma disputa. Os backups serão excluídos conforme seu ciclo normal de rotação.',
          'Se uma empresa cliente adicionou seus dados, podemos encaminhar a solicitação a ela, pois essa empresa decide a finalidade do tratamento. A exclusão no Wapo não exclui automaticamente informações que a Meta, o WhatsApp ou outros terceiros conservem em seus próprios sistemas.',
        ],
      },
      {
        title: 'Instalações independentes',
        paragraphs: [
          `O Wapo é um software de código aberto. Se você usou uma instalação operada por outra organização, entre em contato diretamente com ela. ${site.operator} não pode acessar nem excluir dados de servidores gerenciados por terceiros.`,
        ],
      },
    ],
    contact: 'SOLICITAR EXCLUSÃO',
    contactNote:
      'Inclua apenas as informações necessárias para localizar seu registro.',
    privacyLink: 'Política de privacidade',
  },
}
