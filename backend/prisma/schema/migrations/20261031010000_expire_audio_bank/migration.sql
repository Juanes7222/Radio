-- El banco pre-generado deja de usarse: un audio nombra una hora exacta, así
-- que solo puede sonar en ese minuto y el planificador nuevo sortea minutos.
-- Las filas se marcan `expired` en vez de borrarse para que el historial siga
-- consultable desde el panel; los archivos se van con la purga manual.
UPDATE "generated_audios" SET "status" = 'expired' WHERE "status" = 'ready';
