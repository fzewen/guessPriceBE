import { updateData, handleActiveListing } from './index.js';
// testing logic
await updateData({userId: 1, mlsId: 'ML81952283', price: 1000});
await updateData({userId: 2, mlsId: 'ML81952283', price: 2000});
await updateData({userId: 3, mlsId: 'ML81952283', price: 3000});
const result = await handleActiveListing();
console.log(result);