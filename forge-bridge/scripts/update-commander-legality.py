#!/usr/bin/env python3
"""Refresh the reviewed legality snapshot. Also bump MatchConfig.RULES_VERSION when publishing.
Only names and Oracle IDs are stored; gameplay does not contact Scryfall.
"""
import datetime
import json
from pathlib import Path
import time
import urllib.request

source = 'https://api.scryfall.com/cards/search?q=f%3Acommander&unique=cards'
url = source
cards = {}
while url:
    request = urllib.request.Request(url, headers={
        'User-Agent': 'MesaDeDuelo/0.8 legality-snapshot', 'Accept': 'application/json',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        page = json.load(response)
    for card in page['data']:
        if card['legalities']['commander'] != 'legal':
            raise ValueError('Search returned a nonlegal card: ' + card['name'])
        cards[card['oracle_id']] = {'name': card['name'], 'oracleId': card['oracle_id']}
    url = page.get('next_page')
    time.sleep(0.15)
if len(cards) < 30000:
    raise ValueError('Unexpectedly small snapshot; previous file preserved')
snapshot = {
    'asOf': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
    'source': source,
    'cards': sorted(cards.values(), key=lambda card: card['name']),
}
target = Path(__file__).resolve().parents[2] / 'shared' / 'commander-legality.json'
temporary = target.with_suffix('.json.tmp')
temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
temporary.replace(target)
print(f'Updated {len(cards)} Oracle identities as of {snapshot["asOf"]}. Review and bump the rules version.')
