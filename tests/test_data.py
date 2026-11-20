"""공식 필드·실패 처리·FAQ 매핑 회귀 테스트. 외부 네트워크 미사용."""
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import update_data as u

class PublicDataTests(unittest.TestCase):
    def test_seed_snapshot(self):
        data = u.read()
        self.assertTrue(data['faqs'] and data['events'])
        self.assertTrue(all(x['url'].startswith('https://') for x in data['faqs']))
        self.assertTrue(all(x['start'] <= x['end'] for x in data['events']))
    def test_official_json_list_parksum(self):
        self.assertEqual(u.parse_parking(b'[{"parking_sum":2225}]'), '2225')
    def test_nested_json(self):
        self.assertEqual(u.parse_parking(b'{"body":{"parking_sum":0}}'),'0')
    def test_xml(self):
        self.assertEqual(u.parse_parking(b'<root><parking_sum>2600</parking_sum></root>'),'2600')
    def test_service_maintenance_rejected(self):
        with self.assertRaises(ValueError): u.parse_parking(b'{"msgCode":"9999","parking_sum":9}')
    def test_arbitrary_number_rejected(self):
        for invalid in (b'{"parking_sum":"?"}', b'{}', b'{"parking_sum":null}'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):u.parse_parking(invalid)
    def test_faq_real_column_mapping_and_classification(self):
        csv = '순번,일련번호,카테고리,제목,내용,등록일\n1,12,이용안내,동2문 경사로 안내,"휠체어, 주차장 안내",2026-08-19\n2,13,미사,미사경정공원 안내,미사경정공원 안내,2026-08-19\n'
        actual = u.parse_faq_csv(csv.encode('utf-8-sig'))
        self.assertEqual(len(actual), 1)
        self.assertEqual(actual[0]['registeredAt'], '2026-08-19')
        self.assertIn('wheelchair', actual[0]['tags'])
        self.assertIn('car', actual[0]['tags'])
    def test_faq_handles_quotes_multiline(self):
        content = '제목,내용\n"주차, 이동 안내","첫 줄\n둘째 줄"\n'
        self.assertIn('\n', u.parse_faq_csv(content.encode())[0]['answer'])
    def test_event_xml_field_mapping(self):
        xml = b'<root><item><nm>Test Concert</nm><from>2026-12-01</from><to>2026-12-02</to><site>Hall</site></item></root>'
        found = u.parse_event_xml(xml, {'item':'item','title':'nm','start':'from','end':'to','venue':'site'})
        self.assertEqual(found[0]['venue'], 'Hall')
    def test_event_xml_rejects_unverified_field_map(self):
        with self.assertRaises(ValueError):u.parse_event_xml(b'<root/>', {'item':'item'})
    def test_public_api_default_configured_and_keeps_original_on_error(self):
        self.assertIn('ksponco.or.kr', u.PARKING_PUBLIC_ENDPOINT)
        obj = {'parking':None}
        with patch.object(u, 'download', side_effect=OSError('offline')):
            with self.assertRaises(OSError):u.update_parking(obj)
        self.assertIsNone(obj['parking'])
    def test_public_api_success_without_fabricated_parking_rate(self):
        obj = {'parking':None}
        with patch.object(u, 'download', return_value=b'[{"parking_sum":2225}]'):
            u.update_parking(obj)
        self.assertEqual(obj['parking']['parking_sum'], '2225')
        self.assertNotIn('occupancy', obj['parking'])
        self.assertNotIn('vacancies', obj['parking'])

if __name__=='__main__':unittest.main()
