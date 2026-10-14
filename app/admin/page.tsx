import { redirect } from 'next/navigation';

// 舊的「管理」頁已併入「新增產品」
export default function Admin() { redirect('/new'); }
