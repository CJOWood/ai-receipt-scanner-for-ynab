const { useForm } = ReactHookForm;

function App() {
  const { register, handleSubmit, reset } = useForm();
  const [accounts, setAccounts] = React.useState(() => {
    const saved = localStorage.getItem('accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [newAccount, setNewAccount] = React.useState('');

  const addAccount = () => {
    const trimmed = newAccount.trim();
    if (trimmed && !accounts.includes(trimmed)) {
      const updated = [...accounts, trimmed];
      setAccounts(updated);
      localStorage.setItem('accounts', JSON.stringify(updated));
      setNewAccount('');
    }
  };

  const onSubmit = async (data) => {
    const formData = new FormData();
    formData.append('account', data.account);
    formData.append('file', data.file[0]);

    if (!accounts.includes(data.account)) {
      const updated = [...accounts, data.account];
      setAccounts(updated);
      localStorage.setItem('accounts', JSON.stringify(updated));
    }

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(data.apiKey + ':' + data.apiSecret)
        },
        body: formData
      });

      if (!res.ok) {
        const text = await res.text();
        alert('Upload failed: ' + text);
      } else {
        alert('Upload successful');
        reset();
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };

  return (
    React.createElement('div', null,
      React.createElement('h1', null, 'YNAB Slip Uploader'),
      React.createElement('form', { onSubmit: handleSubmit(onSubmit) },
        React.createElement('div', null,
          React.createElement('label', null, 'API Key:'),
          React.createElement('input', { type: 'text', ...register('apiKey', { required: true }) })
        ),
        React.createElement('div', null,
          React.createElement('label', null, 'API Secret:'),
          React.createElement('input', { type: 'password', ...register('apiSecret', { required: true }) })
        ),
        React.createElement('div', null,
          React.createElement('label', null, 'Bank Account:'),
          React.createElement('select', { ...register('account', { required: true }) },
            React.createElement('option', { value: '', disabled: true }, 'Select account'),
            accounts.map(acc => React.createElement('option', { key: acc, value: acc }, acc))
          ),
          React.createElement('input', {
            value: newAccount,
            onChange: e => setNewAccount(e.target.value),
            placeholder: 'Add account'
          }),
          React.createElement('button', { type: 'button', onClick: addAccount }, 'Add')
        ),
        React.createElement('div', null,
          React.createElement('label', null, 'Receipt:'),
          React.createElement('input', { type: 'file', ...register('file', { required: true }) })
        ),
        React.createElement('button', { type: 'submit' }, 'Submit')
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
