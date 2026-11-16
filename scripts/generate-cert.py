#!/usr/bin/env python3
import datetime
import ipaddress
import os
import socket
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

cert_dir = os.path.join(os.path.dirname(__file__), '..', 'certificates')
os.makedirs(cert_dir, exist_ok=True)

key_path = os.path.join(cert_dir, 'key.pem')
cert_path = os.path.join(cert_dir, 'cert.pem')

print(f"Generating 2048-bit RSA Private Key...")
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

# Write private key
with open(key_path, 'wb') as f:
    f.write(private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ))

print(f"Key written to: {key_path}")

# Gather IP addresses
ip_addresses = [
    ipaddress.IPv4Address("127.0.0.1"),
]

try:
    hostname = socket.gethostname()
    local_ips = socket.gethostbyname_ex(hostname)[2]
    for ip_str in local_ips:
        try:
            ip_obj = ipaddress.IPv4Address(ip_str)
            if ip_obj not in ip_addresses:
                ip_addresses.append(ip_obj)
        except Exception:
            pass
except Exception as e:
    print(f"Note: Could not enumerate all local IPs: {e}")

# Include common VPN subnet IPs if detected (e.g., 26.28.161.84)
extra_ips = ["26.28.161.84"]
for extra_ip in extra_ips:
    try:
        ip_obj = ipaddress.IPv4Address(extra_ip)
        if ip_obj not in ip_addresses:
            ip_addresses.append(ip_obj)
    except Exception:
        pass

san_list = [
    x509.DNSName("localhost"),
    x509.DNSName("*.local"),
    x509.DNSName("*.lan"),
]
for ip in ip_addresses:
    san_list.append(x509.IPAddress(ip))

print(f"Subject Alternative Names (SANs):")
for item in san_list:
    print(f"  - {item.value}")

subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "LA"),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Vientiane"),
    x509.NameAttribute(NameOID.LOCALITY_NAME, "Vientiane Capital"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Lao Telecom (LTC)"),
    x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "IT Department"),
    x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
])

now = datetime.datetime.now(datetime.timezone.utc)
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(private_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - datetime.timedelta(days=1))
    .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
    .add_extension(
        x509.SubjectAlternativeName(san_list),
        critical=False,
    )
    .add_extension(
        x509.BasicConstraints(ca=True, path_length=None),
        critical=True,
    )
    .sign(private_key, hashes.SHA256())
)

with open(cert_path, 'wb') as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print(f"Certificate written to: {cert_path}")
print(f"SSL certificate generated successfully!")
