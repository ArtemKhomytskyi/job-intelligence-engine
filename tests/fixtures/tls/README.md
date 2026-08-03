# Synthetic TLS fixture

The certificate and key in this directory protect no system. They are a
deliberately public, self-signed loopback test identity for
`fixture.synthetic.test`, used only to prove that connection-bound requests
preserve SNI and certificate hostname verification. Production never trusts
this certificate.
