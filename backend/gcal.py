import os
from datetime import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar.events']


def get_calendar_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open('token.json', 'w') as token:
                token.write(creds.to_json())
        else:
            raise Exception("Kredensial tidak valid. Silakan login ulang.")
    return build('calendar', 'v3', credentials=creds)


def sync_schedule_to_gcal(schedule_blocks: list, date_str: str):
    service = get_calendar_service()
    events_created = 0
    events_updated = 0
    errors = []

    for block in schedule_blocks:
        start_iso = f"{date_str}T{block['start_time']}:00+07:00"
        end_date_str = block.get("end_date_str", date_str)
        end_iso = f"{end_date_str}T{block['end_time']}:00+07:00"
        task_id_str = str(block['task_id'])

        if block['start_time'] == block['end_time'] and date_str == end_date_str:
            errors.append(f"Tugas '{block['title']}' gagal: Waktu mulai dan selesai tidak boleh sama.")
            continue

        importance = block.get('importance', 3)
        color_map = {5: "11", 4: "4", 3: "5", 2: "7", 1: "2"}
        color_id = color_map.get(importance, "2")

        existing_events = service.events().list(
            calendarId='primary',
            privateExtendedProperty=f'task_id={task_id_str}'
        ).execute().get('items', [])

        event_body = {
            'summary': block['title'],
            'description': block['reason'],
            'start': {'dateTime': start_iso, 'timeZone': 'Asia/Jakarta'},
            'end': {'dateTime': end_iso, 'timeZone': 'Asia/Jakarta'},
            'colorId': color_id,
            'extendedProperties': {'private': {'task_id': task_id_str}}
        }

        # Tambahkan Reminder jika ini Appointment
        if block.get('item_type') == 'appointment' and block.get('notify_minutes') is not None:
            event_body['reminders'] = {
                'useDefault': False,
                'overrides': [
                    {'method': 'popup', 'minutes': block['notify_minutes']}
                ]
            }

        try:
            if existing_events:
                service.events().update(calendarId='primary', eventId=existing_events[0]['id'],
                                        body=event_body).execute()
                events_updated += 1
            else:
                service.events().insert(calendarId='primary', body=event_body).execute()
                events_created += 1
        except Exception as e:
            errors.append(f"Gagal memproses '{block['title']}': {str(e)}")

    return events_created, events_updated, errors


def delete_gcal_event(task_id: int):
    try:
        service = get_calendar_service()
        events = service.events().list(
            calendarId='primary',
            privateExtendedProperty=f'task_id={task_id}'
        ).execute().get('items', [])
        for event in events:
            service.events().delete(calendarId='primary', eventId=event['id']).execute()
    except Exception as e:
        print(f"Gagal menghapus event dari GCal: {e}")