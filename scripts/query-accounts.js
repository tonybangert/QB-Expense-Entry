require('dotenv').config();
const qb = require('../src/services/quickbooks');

(async () => {
  const result = await qb.query("SELECT Id, Name, AccountSubType FROM Account WHERE AccountType = 'Expense'");
  if (result.Account) {
    result.Account.forEach(a => {
      console.log(`[${a.Id}] ${a.Name} (${a.AccountSubType})`);
    });
  }
})().catch(console.error);
