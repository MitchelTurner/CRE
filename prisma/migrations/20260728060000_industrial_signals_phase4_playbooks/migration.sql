-- Phase 4 playbooks: yard contraction, imports, hiring
INSERT INTO "SignalPlaybook" ("id", "type", "subtype", "channel", "urgencyDays", "talkTrack") VALUES
('pb_yard_contr', 'YARD_UTILIZATION', 'contraction', 'email', 21,
 'Yard coverage at {{company}} dropped ({{detail}}). If trailer parking or warehouse is loosening up, I can quietly canvass sublease / disposition interest.'),
('pb_imports', 'IMPORT_VOLUME', 'growth', 'call', 14,
 '{{company}} container volume is up ({{detail}}) — Inland Port Greer consignees often outgrow dock/yard before they admit it. Open to a quiet look at Greer/Duncan boxes with yard?'),
('pb_hiring', 'HIRING_SURGE', 'warehouse_production', 'call', 14,
 '{{company}} posted {{detail}} warehouse/production roles at one address. That usually means a shift add or a space crunch — happy to walk clear-height / dock options off-market.')
ON CONFLICT ("type", "subtype") DO NOTHING;
