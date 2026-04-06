// @ts-ignore
import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'Radio Admin Backend API',
    description: 'Documentación interactiva de la API para la emisora web',
    version: '1.0.0',
  },
  host: 'localhost:8443',
  schemes: ['http', 'https'],
  basePath: '/',
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./index.ts']; // Apuntamos al archivo principal que registra las rutas

// Configuramos swagger-autogen con promesas
swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
    console.log('Documentación de Swagger generada exitosamente en', outputFile);
});
