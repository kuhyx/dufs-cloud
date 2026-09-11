import 'package:dufs_client/models/transfer_progress.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const upload = TransferProgress(
    kind: TransferKind.upload,
    index: 3,
    total: 7,
    name: 'photo.jpg',
    done: 12 * 1024 * 1024,
    size: 29 * 1024 * 1024,
  );

  test('title names the direction, position and file', () {
    expect(upload.title, 'Uploading 3/7 · photo.jpg');
    expect(
      upload.withDone(0).title,
      'Uploading 3/7 · photo.jpg',
    );
    const download = TransferProgress(
      kind: TransferKind.download,
      index: 1,
      total: 1,
      name: 'big.bin',
      done: 0,
      size: 10,
    );
    expect(download.title, 'Downloading 1/1 · big.bin');
  });

  test('detail shows percent and bytes, clamped to 100 %', () {
    expect(upload.detail, '41 % · 12 MB / 29 MB');
    expect(upload.fraction, closeTo(12 / 29, 1e-9));
    final over = upload.withDone(40 * 1024 * 1024);
    expect(over.fraction, 1);
    expect(over.detail, '100 % · 40 MB / 29 MB');
  });

  test('an unknown size is indeterminate and shows only the byte count', () {
    const empty = TransferProgress(
      kind: TransferKind.download,
      index: 1,
      total: 2,
      name: 'empty.bin',
      done: 512,
      size: 0,
    );
    expect(empty.fraction, isNull);
    expect(empty.detail, '512 B');
  });

  test('withDone keeps every other field', () {
    final next = upload.withDone(5);
    expect(next.kind, TransferKind.upload);
    expect(next.index, 3);
    expect(next.total, 7);
    expect(next.name, 'photo.jpg');
    expect(next.size, upload.size);
    expect(next.done, 5);
  });

  test('cancel flag: check() is silent until cancel(), then throws', () {
    final cancel = TransferCancel();
    expect(cancel.cancelled, isFalse);
    cancel
      ..check()
      ..cancel();
    expect(cancel.cancelled, isTrue);
    expect(cancel.check, throwsA(isA<TransferCancelled>()));
    expect(TransferCancelled().toString(), 'Transfer cancelled');
  });
}
