/**
 * Canonical legal content for La Voz de la Verdad.
 *
 * Single source of truth for the public legal pages. Update content here and
 * the pages, footer and consent forms stay consistent. The markdown versions
 * under docs/legal/ are exported copies for review and app-store submission.
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  lists?: string[];
  after?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Legal identity of the data controller. Complete these fields before going
 * live; they are used across all legal documents.
 */
export const LEGAL_CONTACT = {
  brand: 'La Voz de la Verdad',
  entity: '[Nombre legal de la entidad responsable]',
  nit: '[NIT de la entidad responsable]',
  address: '[Dirección], Cartago, Valle del Cauca, Colombia',
  email: '[correo de contacto de la emisora]',
  social:
    'Facebook (facebook.com/lavozdelaverdad), Instagram (@iglesiacartagommm) y YouTube (@emisoralavozdelaverdad9188)',
} as const;

export const PRIVACY_DOC: LegalDocument = {
  slug: 'privacy',
  title: 'Política de Privacidad',
  updatedAt: '16 de agosto de 2026',
  intro:
    'Esta política explica qué información recopilamos, para qué la usamos y los derechos que tienes sobre ella cuando utilizas la página web, la aplicación móvil o el reproductor de La Voz de la Verdad.',
  sections: [
    {
      heading: 'Responsable',
      paragraphs: [
        `La Voz de la Verdad es una emisora cristiana del Movimiento Misionero Mundial. Quien actúa como responsable del tratamiento de los datos descritos aquí es ${LEGAL_CONTACT.entity} (${LEGAL_CONTACT.nit}), con domicilio en ${LEGAL_CONTACT.address}.`,
        `Estamos sujetos a la Ley 1581 de 2012 y demás normas que la reglamentan. Puedes consultar nuestra [Política de Tratamiento de Datos Personales](/info/data-treatment) para conocer los detalles completos, tus derechos y el procedimiento para ejercerlos.`,
      ],
    },
    {
      heading: 'Información que recopilamos',
      paragraphs: [
        'Al enviar una petición de oración recopilamos tu nombre y el texto de tu petición. Tu petición es revisada por el equipo de la emisora y puede llegar al equipo por correo electrónico para poder interceder por ti.',
      ],
      lists: [
        'Nombre: para identificar tu petición.',
        'Texto de la petición: para gestionarla y responderla.',
        'Identificador de instalación (deviceId): identificador persistente que la app genera para asociar peticiones y preferencias a un mismo dispositivo y permitirte consultar el estado de tus peticiones desde "Mis peticiones". Aunque no contiene tu nombre, cuando se vincula a una petición (nombre y contenido) puede asociarse indirectamente a ti, por lo que se trata como dato personal.',
      ],
      after: [
        'El contenido de tu petición es información que compartes voluntariamente, y por su naturaleza puede revelar datos sensibles (salud, situación familiar, económica, religiosa). Recomendamos no incluir información sensible ni datos de otras personas que no sean necesarios para gestionar tu petición: cuanto menos compartas, menos información queda almacenada. Tu petición puede ser leída por el personal autorizado de la emisora que la gestiona y, cuando corresponda, por el equipo que la responde.',
      ],
    },
    {
      heading: 'Información del dispositivo y notificaciones',
      paragraphs: [
        'LA APP MÓVIL recopila información técnica para funcionar correctamente:',
      ],
      lists: [
        'Token de notificaciones (FCM): para enviarte notificaciones push cuando lo autorizas, como respuestas a tus peticiones o avisos de los programas que eliges seguir.',
        'Suscripciones a programas: los títulos de los programas de los que quieres recibir avisos. Por defecto tienes algunas seleccionadas, y puedes cambiarlas en cualquier momento desde "Mis notificaciones".',
        'Sistema operativo y versión de la app: para diagnóstico técnico y ofrecer versiones correctas.',
        'Identificador de instalación: usado también para recordatorios y seguimiento de peticiones.',
      ],
    },
    {
      heading: 'Qué NO recopilamos',
      paragraphs: [
        'La aplicación no solicita ni recopila directamente la ubicación del dispositivo: no usamos GPS ni pedimos permisos de ubicación. No accedemos a tus contactos, fotos ni micrófono, y no usamos publicidad ni rastreadores. No vendemos información a nadie.',
      ],
    },
    {
      heading: 'Información técnica del streaming',
      paragraphs: [
        'Al escuchar la radio (por web o por app), la transmisión de audio es servida por nuestros servidores de streaming AzuraCast. La analítica de audiencia está configurada en modo limitado (solo agregados): AzuraCast no almacena la dirección IP, el tipo de navegador ni la ubicación de cada oyente. Solo se registran estadísticas agregadas, como el número de oyentes y la duración de escucha, que se muestran agrupadas y no identifican a personas.',
      ],
    },
    {
      heading: 'Panel de administración',
      paragraphs: [
        'El panel administrativo de la página web está reservado al personal autorizado de la emisora. El acceso se realiza con Google (a través de Firebase Authentication) y se procesa el nombre, correo y foto de la cuenta de quien ingresa, únicamente con fines de identificación y seguridad. Estos datos pertenecen exclusivamente al personal autorizado, no forman parte del perfil de los usuarios de la aplicación y no se usan para ningún otro fin.',
      ],
    },
    {
      heading: 'Encargados del tratamiento',
      paragraphs: [
        'Para operar utilizamos proveedores que procesan datos por nuestra cuenta bajo las condiciones de esta política y sus propias políticas de privacidad:',
      ],
      lists: [
        'Firebase (Google): notificaciones push (FCM) y verificación de acceso al panel administrativo.',
        'AzuraCast: servidor de streaming y estadísticas agregadas de audiencia (configuración sin almacenamiento de IP).',
        'Proveedor de correo (SMTP o Brevo): el equipo interno recibe por correo las nuevas peticiones de oración para poder gestionarlas.',
      ],
    },
    {
      heading: 'Distribución y actualización de la aplicación',
      paragraphs: [
        'La aplicación se distribuye y actualiza a través de Google Play, App Store y Expo (EAS). Estos servicios gestionan la entrega de la aplicación y sus actualizaciones y no reciben de nosotros datos personales de los usuarios finales.',
      ],
    },
    {
      heading: 'Enlaces a contenido público',
      paragraphs: [
        'Desde nuestra web y la app enlazamos contenido público alojado en plataformas de terceros (por ejemplo, YouTube, Facebook o Spotify). Al abrirlos se aplican sus propias políticas de privacidad; nuestro servicio no les envía datos personales.',
      ],
    },
    {
      heading: 'Retención de la información',
      paragraphs: [
        'Conservamos tu petición de oración mientras sea necesaria para su gestión y hasta que solicites su eliminación.',
        'Los registros técnicos del servidor (que incluyen la dirección IP) se conservan por un máximo de 30 días y luego se eliminan. Los tokens de notificaciones se conservan mientras el dispositivo esté registrado; si desactivas las notificaciones o desinstalas la aplicación, el servidor elimina el token cuando detecta que dejó de ser válido. Al reinstalar la aplicación se genera un nuevo identificador de instalación.',
        'Las estadísticas agregadas de audiencia no identifican a personas y se conservan por períodos más largos (por ejemplo, para comparar la audiencia por franjas horarias).',
      ],
    },
    {
      heading: 'Menores de edad',
      paragraphs: [
        'Nuestra emisora es un servicio público y puede ser utilizada por menores de edad. De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, los datos de niñas, niños y adolescentes solo se tratarán con la autorización de sus padres o representantes legales, atendiendo al interés superior del menor. Si nos informan o detectamos que se están tratando datos de un menor sin la debida autorización, procederemos a su eliminación. Ver la [Política de Tratamiento de Datos Personales](/info/data-treatment).',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        `Conforme a la Ley 1581 de 2012 tienes derecho a conocer, actualizar, rectificar y suprimir tus datos personales, así como a revocar la autorización de su tratamiento. Puedes ejercerlos escribiéndonos a ${LEGAL_CONTACT.email} o a través de nuestros canales de contacto: ${LEGAL_CONTACT.social}. Consulta el procedimiento en nuestra [Política de Tratamiento de Datos Personales](/info/data-treatment).`,
      ],
    },
    {
      heading: 'Almacenamiento local en tu dispositivo',
      paragraphs: [
        'La web y la app guardan en tu dispositivo pequeñas preferencias locales (por ejemplo, volumen, calidad de audio o tus suscripciones a programas) para personalizar tu experiencia. Puedes borrarlas limpiando los datos del sitio o desinstalando la aplicación. Ver [Política de Cookies](/info/cookies).',
      ],
    },
    {
      heading: 'Seguridad',
      paragraphs: [
        'La información viaja cifrada (HTTPS) entre tu dispositivo y nuestros servidores y el acceso al panel administrativo está protegido y restringido al equipo autorizado. No podemos garantizar una seguridad absoluta, pero aplicamos medidas razonables para proteger tus datos.',
      ],
    },
    {
      heading: 'Modificaciones',
      paragraphs: [
        'Si esta política cambia, publicaremos la versión actualizada en esta página con su nueva fecha. Los cambios relevantes se anunciarán a través de los canales de la emisora.',
        `Contacto: ${LEGAL_CONTACT.email} · ${LEGAL_CONTACT.social}`,
      ],
    },
  ],
};

export const DATA_TREATMENT_DOC: LegalDocument = {
  slug: 'data-treatment',
  title: 'Política de Tratamiento de Datos Personales',
  updatedAt: '16 de agosto de 2026',
  intro:
    'De conformidad con la Ley 1581 de 2012 y sus decretos reglamentarios, La Voz de la Verdad presenta esta política de tratamiento de datos personales, aplicable a los datos recolectados a través de su página web, su aplicación móvil y sus demás canales.',
  sections: [
    {
      heading: '1. Responsable del tratamiento',
      paragraphs: [
        `Responsable del tratamiento: ${LEGAL_CONTACT.entity}, identificada con NIT ${LEGAL_CONTACT.nit}, con domicilio en ${LEGAL_CONTACT.address}. Marca comercial: ${LEGAL_CONTACT.brand}.`,
        `Correo para consultas, reclamos y ejercicio de derechos: ${LEGAL_CONTACT.email}. Canales adicionales: ${LEGAL_CONTACT.social}.`,
      ],
    },
    {
      heading: '2. Definiciones',
      paragraphs: [
        'Las expresiones utilizadas en esta política tienen el significado previsto en la Ley 1581 de 2012. En particular:',
      ],
      lists: [
        'Dato personal: cualquier información vinculada o que pueda asociarse a una persona natural determinada o determinable.',
        'Titular: la persona natural cuyos datos personales son objeto de tratamiento.',
        'Tratamiento: cualquier operación que se realice sobre los datos personales, como recolección, almacenamiento, uso, circulación o supresión.',
        'Responsable: quien decide sobre el tratamiento. Para esta política, es la entidad indicada en el numeral 1.',
        'Autorización: consentimiento previo, expreso e informado del titular para el tratamiento de sus datos.',
      ],
    },
    {
      heading: '3. Datos recolectados y finalidades',
      paragraphs: [
        'Recolectamos y tratamos los datos personales del siguiente modo:',
      ],
      lists: [
        'Nombre y texto de la petición de oración: gestión de la petición, respuesta al titular y contacto del equipo de la emisora para interceder.',
        'Identificador de instalación (deviceId): identificador persistente que asocia peticiones y preferencias a un mismo dispositivo, permite al titular consultar el estado de sus peticiones y controlar el envío de notificaciones. Puede asociarse indirectamente al titular cuando se vincula a sus peticiones.',
        'Token de notificaciones (FCM): enviar al titular las notificaciones que autoriza (respuesta a sus peticiones y avisos de programas).',
        'Suscripciones a programas: enviar avisos de los programas elegidos por el titular.',
        'Sistema operativo y versión de la aplicación: diagnóstico técnico y mejora del servicio.',
        'Dirección IP y datos técnicos de conexión: los registros del servidor pueden incluir la dirección IP con fines de seguridad y prevención de abuso, con retención máxima de 30 días. La analítica de audiencia de AzuraCast está configurada sin almacenamiento de IP (solo agregados).',
      ],
      after: [
        'El contenido de una petición de oración es aportado libremente por el titular. Recomendamos no incluir datos sensibles (salud, situación familiar, económica o religiosa) ni datos de terceros que no sean necesarios para la petición. Cualquier información sensible que el titular incluya voluntariamente se tratará estrictamente para gestionar la petición y no para ninguna otra finalidad.',
      ],
    },
    {
      heading: '4. Autorización',
      paragraphs: [
        'La autorización se obtiene de forma previa, expresa e informada. Al enviar una petición de oración por la web o la aplicación, el titular confirma haber leído esta política y acepta el tratamiento de sus datos para las finalidades señaladas. El tratamiento es necesario para prestar el servicio solicitado y cesa cuando finaliza la finalidad o cuando el titular lo solicita.',
      ],
    },
    {
      heading: '5. Derechos del titular',
      paragraphs: [
        'El titular tiene los derechos establecidos por la Ley 1581 de 2012, entre ellos:',
      ],
      lists: [
        'Conocer, actualizar y rectificar sus datos personales.',
        'Solicitar prueba de la autorización otorgada.',
        'Ser informado, previa solicitud, del uso que se ha dado a sus datos.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.',
        'Revocar la autorización o solicitar la supresión de sus datos cuando no exista deber legal de conservarlos.',
        'Acceder en forma gratuita a sus datos personales. Si los datos se enviaron sin asociarse a una cuenta o comunicación de contacto, la supresión se efectuará identificando el identificador de instalación correspondiente.',
      ],
    },
    {
      heading: '6. Consultas y reclamos',
      paragraphs: [
        'Para ejercer tus derechos puedes escribir a ' + LEGAL_CONTACT.email + ' o usar los canales de contacto: ' + LEGAL_CONTACT.social + '. Debes indicar claramente el derecho que deseas ejercer y los datos que permitan atender tu solicitud (por ejemplo, el nombre y, si la enviaste desde la app, el identificador de instalación o el correo del equipo con el que te contactaste).',
        'Las consultas se atenderán en un plazo máximo de diez (10) días hábiles, prorrogable por cinco (5) días hábiles adicionales cuando la consulta lo requiera. Los reclamos se atenderán en un plazo máximo de quince (15) días hábiles, prorrogable por ocho (8) días hábiles adicionales, conforme a la ley.',
        'Si el reclamo está incompleto, te contactaremos dentro de los cinco (5) días hábiles siguientes para que lo completes; transcurridos dos (2) meses sin información, se entenderá desistido.',
      ],
    },
    {
      heading: '7. Transferencia de datos a terceros',
      paragraphs: [
        'Compartimos información únicamente con proveedores (encargados) que procesan datos para el funcionamiento del servicio, bajo las condiciones de esta política y sus propias políticas de privacidad:',
      ],
      lists: [
        'Firebase (Google): notificaciones push (FCM) y autenticación del panel administrativo.',
        'AzuraCast: streaming de audio y estadísticas agregadas de audiencia (configuración sin almacenamiento de IP).',
        'Proveedor de correo (SMTP o Brevo): notificación interna de nuevas peticiones de oración al equipo de la emisora.',
      ],
    },
    {
      heading: '7.1 Distribución de la aplicación',
      paragraphs: [
        'La aplicación se distribuye y actualiza a través de Google Play, App Store y Expo (EAS). Estos servicios gestionan la entrega de la aplicación y sus actualizaciones y no reciben de nosotros datos personales de los usuarios finales.',
      ],
    },
    {
      heading: '8. Menores de edad',
      paragraphs: [
        'La emisora es un servicio público y puede ser utilizado por menores de edad. De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, los datos de niñas, niños y adolescentes solo podrán tratarse con la autorización de sus padres o representantes legales, atendiendo al interés superior del menor.',
        'Recomendamos que la utilización del servicio por parte de menores cuente con la supervisión de sus padres o representantes. Si detectamos o nos informan que se están tratando datos de un menor sin la debida autorización, procederemos a su eliminación o a regularizar el tratamiento.',
      ],
    },
    {
      heading: '9. Conservación de los datos',
      paragraphs: [
        'Tratamos los datos mientras sean necesarios para las finalidades autorizadas y para cumplir obligaciones legales. Las peticiones de oración se conservan mientras estén en gestión o se solicite su supresión.',
        'Los registros técnicos del servidor (que pueden incluir la dirección IP) se conservan por un máximo de 30 días y luego se eliminan. Los tokens de notificaciones se conservan mientras el dispositivo esté registrado y se eliminan cuando el servidor detecta que dejaron de ser válidos. Las estadísticas de audiencia son agregadas y no identifican a personas.',
      ],
    },
    {
      heading: '10. Vigencia y modificaciones',
      paragraphs: [
        'Esta política rige a partir del 16 de agosto de 2026. Cualquier modificación será publicada en esta página con su fecha de actualización y comunicada por los canales de la emisora cuando sea relevante.',
      ],
    },
  ],
};

export const TERMS_DOC: LegalDocument = {
  slug: 'terms',
  title: 'Términos y Condiciones de Uso',
  updatedAt: '16 de agosto de 2026',
  intro:
    'Estos términos regulan el uso de la página web, la aplicación móvil y el reproductor de La Voz de la Verdad. Al utilizar cualquiera de nuestros servicios, aceptas estos términos.',
  sections: [
    {
      heading: '1. El servicio',
      paragraphs: [
        'La Voz de la Verdad es una emisora cristiana en línea que ofrece, de forma gratuita: transmisión en vivo de audio, programación, contenido bíblico, peticiones de oración, solicitudes de canciones y comunicaciones con la emisora.',
        'Puedes usar todos estos servicios sin crear una cuenta. Algunas funciones requieren que el dispositivo acepte notificaciones.',
      ],
    },
    {
      heading: '2. Aceptación de los términos',
      paragraphs: [
        'Al acceder a la página web, usar la aplicación o enviar una petición, aceptas estos términos y la [Política de Privacidad](/info/privacy) y la [Política de Tratamiento de Datos Personales](/info/data-treatment). Si no estás de acuerdo, no utilices el servicio.',
      ],
    },
    {
      heading: '3. Disposición de la transmisión',
      paragraphs: [
        'La transmisión de audio depende de los servidores de streaming y de tu conexión a internet. No garantizamos disponibilidad permanente o ininterrumpida del servicio: puede haber interrupciones por mantenimiento, fallas técnicas, eventos especiales o causas ajenas a nuestro control.',
      ],
    },
    {
      heading: '4. Peticiones de oración y solicitudes de canciones',
      paragraphs: [
        'Las peticiones de oración y las solicitudes de canciones deben ser usadas de buena fe y con contenido respetuoso. Está prohibido:',
      ],
      lists: [
        'Enviar contenido ilegal, ofensivo, difamatorio, discriminatorio o que atente contra terceros.',
        'Enviar contenido repetido de forma abusiva o con fines de suplantación.',
        'Solicitar canciones o contenidos que no estén disponibles en nuestra biblioteca.',
      ],
    },
    {
      heading: '4.1 Contenido de tus peticiones',
      paragraphs: [
        'Tu petición de oración es información que compartes voluntariamente. Ten en cuenta:',
      ],
      lists: [
        'Evita incluir datos personales sensibles (salud, situación familiar, económica o religiosa) o datos de otras personas que no sean necesarios para tu petición.',
        'Eres responsable del contenido que envías y de no vulnerar los derechos de terceros.',
        'Tu petición puede ser leída por el personal autorizado de la emisora que la gestiona y, cuando corresponda, por el equipo que la responde.',
        'La emisora puede moderar, rechazar o eliminar peticiones que infrinjan estos términos.',
      ],
    },
    {
      heading: '5. Contenido',
      paragraphs: [
        'La emisora transmite y pone a disposición contenido de su propia producción (programas, predicas, anuncios) y contenido musical y de terceros con las autorizaciones respectivas. Está prohibido:',
      ],
      lists: [
        'Reproducir, grabar o redistribuir el contenido con fines comerciales sin autorización.',
        'Usar el contenido para fines distintos de la escucha personal y la edificación.',
        'Manipular o interferir la transmisión, la web o la aplicación.',
      ],
    },
    {
      heading: '6. Propiedad intelectual',
      paragraphs: [
        'Los nombres, logotipos, marcas, programas, audios y demás contenidos de la emisora son de su titularidad o de sus licenciantes. El uso del servicio no otorga ningún derecho de propiedad sobre ellos.',
      ],
    },
    {
      heading: '7. Conducta y uso aceptable',
      paragraphs: [
        'Al usar nuestros servicios te comprometes a no: usar medios automatizados para saturar o interferir el servicio; intentar acceder a áreas restringidas (como el panel administrativo); suplantar personas; ni realizar actividades que afecten a otros usuarios o a la operación de la emisora.',
      ],
    },
    {
      heading: '8. Disponibilidad, suspensión y modificación',
      paragraphs: [
        'Podemos suspender, modificar o discontinuar total o parcialmente el servicio (incluida la programación) cuando sea necesario, sin previo aviso. También podemos suspender el acceso de quienes infrinjan estos términos.',
      ],
    },
    {
      heading: '9. Responsabilidad',
      paragraphs: [
        'El servicio se presta "tal cual". En la medida permitida por la ley, no somos responsables por daños derivados de la interrupción del servicio, de la pérdida de datos (por ejemplo, peticiones eliminadas) ni por el uso indebido que terceros hagan del contenido.',
      ],
    },
    {
      heading: '10. Ley aplicable',
      paragraphs: [
        'Estos términos se rigen por las leyes de la República de Colombia. Los conflictos se someterán a las autoridades judiciales de Colombia.',
      ],
    },
    {
      heading: '11. Contacto',
      paragraphs: [
        `Si tienes preguntas sobre estos términos, escríbenos a ${LEGAL_CONTACT.email} o contáctanos por ${LEGAL_CONTACT.social}.`,
      ],
    },
  ],
};

export const COOKIES_DOC: LegalDocument = {
  slug: 'cookies',
  title: 'Política de Cookies y Almacenamiento Local',
  updatedAt: '16 de agosto de 2026',
  intro:
    'Esta página explica qué cookies y tecnologías de almacenamiento local utiliza nuestro sitio web y nuestra aplicación móvil, y cómo puedes controlarlas.',
  sections: [
    {
      heading: 'Que son las cookies',
      paragraphs: [
        'Las cookies son pequeños archivos de texto que los sitios web guardan en tu dispositivo al visitarlos, para recordar información de tu visita.',
      ],
    },
    {
      heading: 'Cookies en este sitio web',
      paragraphs: [
        'Este sitio web NO utiliza cookies de seguimiento, de publicidad ni de analítica externa. No usamos Google Analytics, Meta Pixel ni servicios de publicidad.',
        'En lugar de cookies, usamos almacenamiento local del navegador para:',
      ],
      lists: [
        'Guardar la sesión del panel administrativo (solo personal autorizado de la emisora).',
        'Recordar preferencias del reproductor (por ejemplo, calidad de audio y volumen).',
        'Guardar en caché los recursos de la aplicación (service worker PWA) para que cargue más rápido.',
      ],
    },
    {
      heading: 'Almacenamiento local de terceros en el sitio web',
      paragraphs: [
        'El panel administrativo usa los servicios de autenticación de Google (Firebase), que pueden guardar sus propios datos localmente conforme a sus políticas. El video en vivo se reproduce a través de YouTube cuando la emisora transmite por esa plataforma.',
      ],
    },
    {
      heading: 'Aplicación móvil',
      paragraphs: [
        'La aplicación móvil no usa cookies. Utiliza el almacenamiento propio de la app (AsyncStorage) para guardar en tu dispositivo:',
      ],
      lists: [
        'Preferencias locales: suscripciones a programas, alarmas, temporizador de apagado, favoritos y calidad de audio.',
        'Identificador de instalación y token de notificaciones (FCM).',
      ],
      after: [
        'Los datos personales que la app envía al servidor (como tu petición de oración o tus suscripciones) se tratan según la Política de Privacidad y la Política de Tratamiento de Datos Personales. Esta política se limita a las tecnologías de almacenamiento en tu dispositivo.',
      ],
    },
    {
      heading: 'Como controlarlas',
      paragraphs: [
        'Puedes borrar el almacenamiento local del sitio desde la configuración de tu navegador y eliminar los datos de la aplicación desde la configuración del sistema o desinstalándola. Esto puede resetear algunas preferencias, pero no impide escuchar la radio.',
      ],
    },
  ],
};

export const LEGAL_DOCS: LegalDocument[] = [
  TERMS_DOC,
  PRIVACY_DOC,
  DATA_TREATMENT_DOC,
  COOKIES_DOC,
];