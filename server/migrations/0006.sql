-- Play stats on Seattle time, not UTC: every stored play is re-dated to its Pacific date from its
-- timestamp, with US daylight time (second Sunday of March to first Sunday of November, 2:00 local). Safe to run again.
UPDATE plays SET day = date((at / 1000 - CASE WHEN at / 1000 >= CAST(strftime('%s', date(strftime('%Y', at / 1000, 'unixepoch') || '-03-01', 'weekday 0', '+7 days'), '+10 hours') AS INTEGER) AND at / 1000 < CAST(strftime('%s', date(strftime('%Y', at / 1000, 'unixepoch') || '-11-01', 'weekday 0'), '+9 hours') AS INTEGER) THEN 25200 ELSE 28800 END), 'unixepoch');
