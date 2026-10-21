export const controlsEs = {
  'team.invite': 'Invitar miembro',
  'team.inviteDescription':
    'Envía una invitación por email para unirse a este proyecto.',
  'team.editAccess': 'Editar acceso',
  'team.removeDescription':
    'Se quitará el acceso de esta persona únicamente al proyecto actual. Su cuenta y los demás proyectos se conservarán.',
  'team.members': 'miembros',
  'team.you': 'Vos',
  'team.empty': 'Todavía no hay miembros',
  'team.emptyDescription':
    'Invita a tu equipo para empezar a colaborar en este proyecto.',
  'team.noResultsDescription': 'Prueba con otro nombre, email o estado.',
  'team.clearFilters': 'Limpiar filtros',
  'team.scopeHint': 'Los permisos se aplican únicamente a este proyecto.',
  'profile.details': 'Perfil',
  'profile.security': 'Seguridad',
  'preferences.title': 'Preferencias',
  'preferences.description':
    'El tema sigue al sistema por defecto. El idioma se detecta desde el navegador y se guarda en tu cuenta al registrarte; puedes cambiar ambos aquí.',
  'preferences.theme': 'Tema',
  'preferences.system': 'Sistema',
  'preferences.light': 'Claro',
  'preferences.dark': 'Oscuro',
  'passwordStrength.show': 'Mostrar contraseña',
  'passwordStrength.hide': 'Ocultar contraseña',
  'passwordStrength.label': 'Fortaleza de la contraseña',
  'passwordStrength.short': 'Demasiado corta: mínimo 12 bytes',
  'passwordStrength.long': 'Demasiado larga: máximo 72 bytes',
  'passwordStrength.checking': 'Evaluando contraseña…',
  'passwordStrength.unavailable': 'No se pudo estimar la fortaleza',
  'passwordStrength.weak': 'Débil: fácil de adivinar',
  'passwordStrength.fair': 'Aceptable, pero mejorable',
  'passwordStrength.good': 'Buena',
  'passwordStrength.strong': 'Fuerte',
  'passwordStrength.advice':
    'Añade palabras poco relacionadas y evita secuencias, repeticiones o datos personales.',
  'passwordStrength.estimate':
    'Estimación local de fortaleza; tu contraseña no se envía para analizarla.',
} as const

export const controlsEn: Record<keyof typeof controlsEs, string> = {
  'team.invite': 'Invite member',
  'team.inviteDescription': 'Send an email invitation to join this project.',
  'team.editAccess': 'Edit access',
  'team.removeDescription':
    'Access will be removed only from this project. The account and other projects will be retained.',
  'team.members': 'members',
  'team.you': 'You',
  'team.empty': 'No members yet',
  'team.emptyDescription':
    'Invite your team to start collaborating on this project.',
  'team.noResultsDescription': 'Try a different name, email or status.',
  'team.clearFilters': 'Clear filters',
  'team.scopeHint': 'Permissions apply only to this project.',
  'profile.details': 'Profile',
  'profile.security': 'Security',
  'preferences.title': 'Preferences',
  'preferences.description':
    'Theme follows your system by default. Language is detected from your browser and saved to your account at signup; you can change both here.',
  'preferences.theme': 'Theme',
  'preferences.system': 'System',
  'preferences.light': 'Light',
  'preferences.dark': 'Dark',
  'passwordStrength.show': 'Show password',
  'passwordStrength.hide': 'Hide password',
  'passwordStrength.label': 'Password strength',
  'passwordStrength.short': 'Too short: at least 12 bytes',
  'passwordStrength.long': 'Too long: at most 72 bytes',
  'passwordStrength.checking': 'Checking password…',
  'passwordStrength.unavailable': 'Could not estimate strength',
  'passwordStrength.weak': 'Weak: easy to guess',
  'passwordStrength.fair': 'Fair, but could be stronger',
  'passwordStrength.good': 'Good',
  'passwordStrength.strong': 'Strong',
  'passwordStrength.advice':
    'Add unrelated words and avoid sequences, repetition or personal information.',
  'passwordStrength.estimate':
    'Local strength estimate; your password is not sent anywhere for analysis.',
}

export const controlsPt: Record<keyof typeof controlsEs, string> = {
  'team.invite': 'Convidar membro',
  'team.inviteDescription':
    'Envie um convite por email para participar deste projeto.',
  'team.editAccess': 'Editar acesso',
  'team.removeDescription':
    'O acesso será removido somente deste projeto. A conta e os demais projetos serão mantidos.',
  'team.members': 'membros',
  'team.you': 'Você',
  'team.empty': 'Ainda não há membros',
  'team.emptyDescription':
    'Convide sua equipe para começar a colaborar neste projeto.',
  'team.noResultsDescription': 'Tente outro nome, email ou estado.',
  'team.clearFilters': 'Limpar filtros',
  'team.scopeHint': 'As permissões se aplicam somente a este projeto.',
  'profile.details': 'Perfil',
  'profile.security': 'Segurança',
  'preferences.title': 'Preferências',
  'preferences.description':
    'O tema segue o sistema por padrão. O idioma é detectado pelo navegador e salvo na sua conta ao se cadastrar; você pode alterar ambos aqui.',
  'preferences.theme': 'Tema',
  'preferences.system': 'Sistema',
  'preferences.light': 'Claro',
  'preferences.dark': 'Escuro',
  'passwordStrength.show': 'Mostrar senha',
  'passwordStrength.hide': 'Ocultar senha',
  'passwordStrength.label': 'Força da senha',
  'passwordStrength.short': 'Muito curta: mínimo de 12 bytes',
  'passwordStrength.long': 'Muito longa: máximo de 72 bytes',
  'passwordStrength.checking': 'Avaliando senha…',
  'passwordStrength.unavailable': 'Não foi possível estimar a força',
  'passwordStrength.weak': 'Fraca: fácil de adivinhar',
  'passwordStrength.fair': 'Razoável, mas pode melhorar',
  'passwordStrength.good': 'Boa',
  'passwordStrength.strong': 'Forte',
  'passwordStrength.advice':
    'Adicione palavras sem relação e evite sequências, repetições ou dados pessoais.',
  'passwordStrength.estimate':
    'Estimativa local de força; sua senha não é enviada para análise.',
}
