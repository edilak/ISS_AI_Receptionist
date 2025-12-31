function testRegex(message) {
  console.log(`Testing: "${message}"`);
  
  // Improved Regex
  const pathRegex = /(?:how\s+(?:can\s+I|to|do\s+I)\s+(?:get|go|navigate|travel)(?:\s+to)?\s+)?(?:from\s+)?(.+?)\s+(?:to)\s+(.+?)(?:\?|$)/i;
  const pathRegex2 = /(?:how\s+(?:can\s+I|to|do\s+I)\s+(?:get|go|navigate|travel)(?:\s+to)?\s+)?(.+?)\s+(?:from)\s+(.+?)(?:\?|$)/i;
  
  console.log('Using Improved Regex...');
  let match = message.match(pathRegex);
  
  if (match) {
    console.log('Match Regex 1 (from...to)');
    from = match[1];
    to = match[2];
  } else {
    match = message.match(pathRegex2);
    if (match) {
      console.log('Match Regex 2 (to...from)');
      to = match[1];
      from = match[2];
    } else {
      console.log('No match');
      return;
    }
  }
  
  console.log(`  Raw From: "${from}"`);
  console.log(`  Raw To: "${to}"`);
  
  // Clean up
  if (from) from = from.replace(/^hsitp\s+/i, '').trim();
  if (to) to = to.replace(/^hsitp\s+/i, '').trim();
  
  console.log(`  Clean From: "${from}"`);
  console.log(`  Clean To: "${to}"`);
}

testRegex("how can I get to from zone 3 to zone 1 1 floor");
testRegex("from zone 3 to zone 1");
testRegex("how to go from zone 3 to zone 1");
testRegex("navigate to zone 1 from zone 3");
