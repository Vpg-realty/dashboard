// Settings › TC Pay (Luke, Oct 16, layout A): the transaction coordinator's
// fee and commission rules, on their own page (RulesView's TC section).
import RulesView from './RulesView.jsx';

export default function TcPayView() {
  return <RulesView only={['Transaction coordinator']} byPerson={false} changesList={false} />;
}
